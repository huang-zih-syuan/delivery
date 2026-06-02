# 雲端部署說明

本專案可部署到 Render 的 Python Web Service。

## 部署步驟

1. 將整個專案資料夾推送到 GitHub repository。
2. 登入 Render，選擇 New Web Service。
3. 連接剛剛的 GitHub repository。
4. 設定：
   - Runtime: Python
   - Build Command: `python3 -m pip install --upgrade pip && python3 -m pip install -r requirements.txt`
   - Start Command: `python3 -m gunicorn app:app --bind 0.0.0.0:$PORT`
5. 建立服務後等待部署完成。
6. Render 會產生一個公開網址，打開後即可使用網頁系統。

## 必要檔案

- `app.py`：Flask 後端與 API。
- `index.html`：網頁介面。
- `script.js`：前端互動與 API 呼叫。
- `styles.css`：網頁樣式。
- `requirements.txt`：Python 套件。
- `Procfile`：雲端啟動指令。
- `render.yaml`：Render 部署設定。
