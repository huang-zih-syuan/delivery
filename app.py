from __future__ import annotations

import heapq
import itertools
import math
import time
from dataclasses import dataclass
from typing import Any

from flask import Flask, jsonify, request, send_from_directory


app = Flask(__name__, static_folder=".", static_url_path="")


@dataclass(frozen=True)
class Task:
    id: str
    name: str
    delivery: int
    pickup: int


@dataclass(frozen=True)
class Vehicle:
    id: str
    capacity: int


@dataclass(frozen=True)
class SearchState:
    vehicle_index: int
    current_pos: str
    current_time: float
    route_delivery_sum: int
    current_load: int
    unvisited: frozenset[str]
    routes: tuple[tuple[str, ...], ...]


@app.get("/")
def index():
    return send_from_directory(".", "index.html")


@app.post("/api/optimize")
def optimize_route():
    started_at = time.perf_counter()
    payload = request.get_json(silent=True) or {}

    try:
        graph, depot, depot_name, tasks, vehicles = parse_payload(payload)
        important_nodes = [depot, *[task.id for task in tasks]]
        cost_matrix = build_cost_matrix(graph, important_nodes)
        best = branch_and_bound_optimize(depot, tasks, vehicles, cost_matrix)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    if best is None:
        return jsonify({
            "ok": False,
            "error": "No feasible route found under the current fleet and capacity constraints.",
        }), 422

    total_time, routes = best
    elapsed_ms = max(1, round((time.perf_counter() - started_at) * 1000))
    response = format_solution(
        depot=depot,
        depot_name=depot_name,
        tasks={task.id: task for task in tasks},
        vehicles=vehicles,
        cost_matrix=cost_matrix,
        routes=routes,
        total_time=total_time,
        runtime_ms=elapsed_ms,
    )
    return jsonify(response)


@app.route("/api/optimize", methods=["OPTIONS"])
def optimize_route_options():
    return ("", 204)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


def parse_payload(payload: dict[str, Any]) -> tuple[dict[str, list[tuple[str, float]]], str, str, list[Task], list[Vehicle]]:
    depot = str(payload.get("depot") or payload.get("startNodeId") or "")
    if not depot:
        raise ValueError("Missing required field: depot")
    depot_name = str(payload.get("depot_name") or payload.get("depotName") or f"Node {depot}")

    graph = normalize_graph(payload.get("graph") or payload.get("edges"))
    if depot not in graph:
        graph.setdefault(depot, [])

    raw_tasks = payload.get("destinations") or payload.get("tasks") or []
    tasks = []
    for item in raw_tasks:
        task_id = str(item.get("id") or item.get("node_id") or "")
        if not task_id:
            raise ValueError("Every destination must include an id.")
        delivery = int(item.get("delivery", item.get("delivery_amount", 0)) or 0)
        pickup = int(item.get("pickup", item.get("pickup_amount", 0)) or 0)
        if delivery < 0 or pickup < 0:
            raise ValueError("Delivery and pickup amounts must be non-negative.")
        tasks.append(Task(
            id=task_id,
            name=str(item.get("name") or f"Node {task_id}"),
            delivery=delivery,
            pickup=pickup,
        ))

    if not tasks:
        raise ValueError("At least one destination task is required.")

    raw_vehicles = payload.get("vehicles") or []
    vehicles = []
    for index, item in enumerate(raw_vehicles, start=1):
        vehicle_id = str(item.get("id") or index)
        capacity = int(item.get("capacity", 0) or 0)
        if capacity <= 0:
            raise ValueError("Every vehicle must include a positive capacity.")
        vehicles.append(Vehicle(id=vehicle_id, capacity=capacity))

    if not vehicles:
        raise ValueError("At least one vehicle is required.")

    for task in tasks:
        graph.setdefault(task.id, [])

    return graph, depot, depot_name, tasks, vehicles


def normalize_graph(raw_graph: Any) -> dict[str, list[tuple[str, float]]]:
    graph: dict[str, list[tuple[str, float]]] = {}

    if isinstance(raw_graph, dict):
        for raw_from, neighbors in raw_graph.items():
            from_id = str(raw_from)
            graph.setdefault(from_id, [])

            if isinstance(neighbors, dict):
                iterable = neighbors.items()
                for raw_to, weight in iterable:
                    add_undirected_edge(graph, from_id, str(raw_to), float(weight))
            elif isinstance(neighbors, list):
                for item in neighbors:
                    if isinstance(item, dict):
                        to_id = str(item.get("to") or item.get("target") or item.get("id"))
                        weight = float(item.get("weight", item.get("time", 0)))
                    else:
                        to_id = str(item[0])
                        weight = float(item[1])
                    add_undirected_edge(graph, from_id, to_id, weight)
            else:
                raise ValueError("Invalid graph adjacency list format.")
        return graph

    if isinstance(raw_graph, list):
        for item in raw_graph:
            from_id = str(item.get("from") or item.get("source"))
            to_id = str(item.get("to") or item.get("target"))
            weight = float(item.get("weight", item.get("time", 0)))
            add_undirected_edge(graph, from_id, to_id, weight)
        return graph

    raise ValueError("Missing or invalid graph data.")


def add_undirected_edge(graph: dict[str, list[tuple[str, float]]], from_id: str, to_id: str, weight: float):
    if not from_id or not to_id or weight <= 0:
        raise ValueError("Every edge must include from, to, and a positive weight.")
    graph.setdefault(from_id, []).append((to_id, weight))
    graph.setdefault(to_id, []).append((from_id, weight))


def dijkstra(graph: dict[str, list[tuple[str, float]]], source: str) -> dict[str, float]:
    distances = {node: math.inf for node in graph}
    distances[source] = 0.0
    heap = [(0.0, source)]

    while heap:
        current_distance, node = heapq.heappop(heap)
        if current_distance > distances[node]:
            continue

        for neighbor, weight in graph.get(node, []):
            candidate = current_distance + weight
            if candidate < distances.get(neighbor, math.inf):
                distances[neighbor] = candidate
                heapq.heappush(heap, (candidate, neighbor))

    return distances


def build_cost_matrix(graph: dict[str, list[tuple[str, float]]], important_nodes: list[str]) -> dict[str, dict[str, float]]:
    matrix: dict[str, dict[str, float]] = {}
    unique_nodes = list(dict.fromkeys(important_nodes))

    for source in unique_nodes:
        shortest_paths = dijkstra(graph, source)
        matrix[source] = {}
        for target in unique_nodes:
            distance = shortest_paths.get(target, math.inf)
            if math.isinf(distance):
                raise ValueError(f"Node {target} is unreachable from node {source}.")
            matrix[source][target] = distance

    return matrix


def branch_and_bound_optimize(
    depot: str,
    tasks: list[Task],
    vehicles: list[Vehicle],
    cost_matrix: dict[str, dict[str, float]],
) -> tuple[float, tuple[tuple[str, ...], ...]] | None:
    task_by_id = {task.id: task for task in tasks}
    task_ids = frozenset(task_by_id)
    empty_routes = tuple(() for _ in vehicles)
    initial_state = SearchState(
        vehicle_index=0,
        current_pos=depot,
        current_time=0.0,
        route_delivery_sum=0,
        current_load=0,
        unvisited=task_ids,
        routes=empty_routes,
    )

    upper_bound = float("inf")
    best_routes: tuple[tuple[str, ...], ...] | None = None
    counter = itertools.count()
    heap: list[tuple[float, int, SearchState]] = []
    heapq.heappush(heap, (lower_bound(initial_state, depot, cost_matrix), next(counter), initial_state))

    while heap:
        estimated_cost, _, state = heapq.heappop(heap)
        if estimated_cost >= upper_bound:
            continue

        if not state.unvisited:
            final_time = state.current_time + cost_matrix[state.current_pos][depot]
            if final_time < upper_bound:
                upper_bound = final_time
                best_routes = state.routes
            continue

        vehicle = vehicles[state.vehicle_index]

        for next_task_id in state.unvisited:
            task = task_by_id[next_task_id]
            new_route_delivery_sum = state.route_delivery_sum + task.delivery
            if new_route_delivery_sum > vehicle.capacity:
                continue

            load_before_service = state.current_load + task.delivery
            if load_before_service > vehicle.capacity:
                continue

            new_load = load_before_service - task.delivery + task.pickup
            if new_load > vehicle.capacity:
                continue

            new_time = state.current_time + cost_matrix[state.current_pos][next_task_id]
            routes = append_to_active_route(state.routes, state.vehicle_index, next_task_id)
            child = SearchState(
                vehicle_index=state.vehicle_index,
                current_pos=next_task_id,
                current_time=new_time,
                route_delivery_sum=new_route_delivery_sum,
                current_load=new_load,
                unvisited=state.unvisited - {next_task_id},
                routes=routes,
            )
            child_lb = lower_bound(child, depot, cost_matrix)
            if child_lb < upper_bound:
                heapq.heappush(heap, (child_lb, next(counter), child))

        active_route_has_tasks = len(state.routes[state.vehicle_index]) > 0
        has_next_vehicle = state.vehicle_index + 1 < len(vehicles)
        if active_route_has_tasks and has_next_vehicle:
            switch_time = state.current_time + cost_matrix[state.current_pos][depot]
            child = SearchState(
                vehicle_index=state.vehicle_index + 1,
                current_pos=depot,
                current_time=switch_time,
                route_delivery_sum=0,
                current_load=0,
                unvisited=state.unvisited,
                routes=state.routes,
            )
            child_lb = lower_bound(child, depot, cost_matrix)
            if child_lb < upper_bound:
                heapq.heappush(heap, (child_lb, next(counter), child))

    if best_routes is None:
        return None

    return upper_bound, best_routes


def append_to_active_route(routes: tuple[tuple[str, ...], ...], vehicle_index: int, task_id: str) -> tuple[tuple[str, ...], ...]:
    mutable_routes = [list(route) for route in routes]
    mutable_routes[vehicle_index].append(task_id)
    return tuple(tuple(route) for route in mutable_routes)


def lower_bound(state: SearchState, depot: str, cost_matrix: dict[str, dict[str, float]]) -> float:
    if not state.unvisited:
        return state.current_time + cost_matrix[state.current_pos][depot]

    positive_edges = [
        cost
        for row in cost_matrix.values()
        for cost in row.values()
        if cost > 0 and not math.isinf(cost)
    ]
    min_edge = min(positive_edges, default=0)
    required_future_legs = len(state.unvisited)
    if len(state.routes[state.vehicle_index]) > 0:
        required_future_legs += 1
    return state.current_time + min_edge * required_future_legs


def format_solution(
    depot: str,
    depot_name: str,
    tasks: dict[str, Task],
    vehicles: list[Vehicle],
    cost_matrix: dict[str, dict[str, float]],
    routes: tuple[tuple[str, ...], ...],
    total_time: float,
    runtime_ms: int,
) -> dict[str, Any]:
    formatted_routes = []
    assignments = {}

    for vehicle, route in zip(vehicles, routes):
        if not route:
            formatted_routes.append({
                "vehicle_id": vehicle.id,
                "capacity": vehicle.capacity,
                "sequence": [],
                "travel_time": 0,
                "stops": [],
            })
            continue

        sequence = [depot, *route, depot]
        travel_time = sum(cost_matrix[sequence[i]][sequence[i + 1]] for i in range(len(sequence) - 1))
        initial_load = sum(tasks[task_id].delivery for task_id in route)
        current_load = initial_load
        stops = [{
            "node_id": depot,
            "name": depot_name,
            "event": "start",
            "delivery": 0,
            "pickup": 0,
            "travel_from_previous": 0,
            "cumulative_time": 0,
            "load_after": current_load,
            "capacity": vehicle.capacity,
            "status": f"車上載重 {current_load} / {vehicle.capacity}",
        }]

        cumulative_time = 0
        previous_node = depot
        for task_id in route:
            task = tasks[task_id]
            leg_time = cost_matrix[previous_node][task_id]
            cumulative_time += leg_time
            current_load = current_load - task.delivery + task.pickup
            assignments[task_id] = vehicle.id
            stops.append({
                "node_id": task.id,
                "name": task.name,
                "event": "delivery" if task.delivery >= task.pickup else "pickup",
                "delivery": task.delivery,
                "pickup": task.pickup,
                "travel_from_previous": leg_time,
                "cumulative_time": cumulative_time,
                "load_after": current_load,
                "capacity": vehicle.capacity,
                "status": f"車上載重 {current_load} / {vehicle.capacity}",
            })
            previous_node = task_id

        return_time = cost_matrix[previous_node][depot]
        cumulative_time += return_time
        stops.append({
            "node_id": depot,
            "name": f"返回{depot_name}",
            "event": "return",
            "delivery": 0,
            "pickup": 0,
            "travel_from_previous": return_time,
            "cumulative_time": cumulative_time,
            "load_after": current_load,
            "capacity": vehicle.capacity,
            "status": "安全返航",
        })

        formatted_routes.append({
            "vehicle_id": vehicle.id,
            "capacity": vehicle.capacity,
            "sequence": sequence,
            "travel_time": travel_time,
            "stops": stops,
        })

    return {
        "ok": True,
        "runtime_ms": runtime_ms,
        "total_time": total_time,
        "assignments": assignments,
        "routes": formatted_routes,
        "cost_matrix": cost_matrix,
    }


if __name__ == "__main__":
    app.run(debug=True)
