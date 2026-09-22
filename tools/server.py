# 本地开发服务器：在 python http.server 基础上追加 no-cache 响应头，
# 保证并行开发时浏览器每次页面加载都拿到磁盘最新脚本（杜绝旧模块缓存导致的 SyntaxError）。
# 用法：python tools/server.py  （等价于之前的 python -m http.server 8765 --bind 127.0.0.1）
# 行为：绑定成功后才自动打开浏览器（杜绝"先开页面后起服务"的空响应）；
#       端口被占用时打印可读原因并挂起窗口，避免双击 bat 时黑窗一闪而过。
# 注意：运行期输出保持纯 ASCII，兼容任意系统代码页的控制台。
import sys
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

try:                       # Python 3.7+ 自带多线程版；3.6 及以下退回 ThreadingMixIn 手工混入
    from http.server import ThreadingHTTPServer
except ImportError:
    from socketserver import ThreadingMixIn

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

HOST = '127.0.0.1'
PORT = 8765
URL = 'http://%s:%d' % (HOST, PORT)


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):   # 安静模式：仅记录错误，不刷屏
        pass


def main():
    try:
        server = ThreadingHTTPServer((HOST, PORT), NoCacheHandler)
    except OSError as exc:
        print('')
        print('[ERROR] Cannot listen on %s -> %s' % (URL, exc), flush=True)
        print('Port %d is probably occupied by another program or a leftover server.' % PORT, flush=True)
        print('Find it:  netstat -ano | findstr :%d' % PORT, flush=True)
        print('Identify it by PID:  tasklist /fi "PID eq NUMBER"', flush=True)
        print('Close that program, then re-run this launcher.', flush=True)
        try:
            input('Press Enter to exit...')
        except (EOFError, KeyboardInterrupt):
            pass
        sys.exit(1)

    print('Serving %s  (Cache-Control: no-store; close this window to stop)' % URL, flush=True)
    webbrowser.open(URL)   # 服务就绪后再开浏览器
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
