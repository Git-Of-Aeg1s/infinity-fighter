# 本地开发服务器：在 python http.server 基础上追加 no-cache 响应头，
# 保证并行开发时浏览器每次页面加载都拿到磁盘最新脚本（杜绝旧模块缓存导致的 SyntaxError）。
# 用法：python tools/server.py  （等价于之前的 python -m http.server 8765 --bind 127.0.0.1）
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):   # 安静模式：仅记录错误，不刷屏
        pass


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 8765), NoCacheHandler)
    print('Serving http://127.0.0.1:8765  (Cache-Control: no-store; close this window to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
