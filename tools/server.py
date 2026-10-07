# 本地开发服务器：在 python http.server 基础上追加 no-cache 响应头，
# 保证并行开发时浏览器每次页面加载都拿到磁盘最新脚本（杜绝旧模块缓存导致的 SyntaxError）。
# 用法：python tools/server.py   （启动游戏.bat 会调起本脚本）
# 行为：
#   - 端口冲突自动回退：首选 8765；被无关程序占用（输入法 / IM 等本地服务）时顺延 8766~8785，
#     全忙则交由系统自动分配——端口被占不再导致无法启动；
#   - 复用检测：8765 上若已有一个健康的本游戏服务器（首页含游戏标题 ASCII 标记），直接复用——
#     只开浏览器、不重复起服务（双击两次 bat = 开两个游戏页，而不是报错）；
#   - 绑定成功后才自动打开浏览器（杜绝「先开页面后起服务」的空响应）；
#   - 运行期输出保持纯 ASCII，兼容任意系统代码页的控制台。
#   - 测试钩子：环境变量 BIF_NO_BROWSER=1 时只起服务不弹浏览器（供自动化验证使用）。
import os
import sys
import webbrowser
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler

try:                       # Python 3.7+ 自带多线程版；3.6 及以下退回 ThreadingMixIn 手工混入
    from http.server import ThreadingHTTPServer
except ImportError:
    from socketserver import ThreadingMixIn

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

HOST = '127.0.0.1'
PORT_BASE = 8765
PORT_SPAN = 21    # 8765~8785 顺延扫描；全忙则系统自动分配
MARKER = 'Big Infinity Fighter'   # index.html <title> 内的 ASCII 标记：识别「是否本游戏服务器」


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):   # 安静模式：不刷屏（保留默认错误输出）
        pass


def game_serving_on(url):
    """该地址是否已有一个健康的本游戏服务器在跑（首页含游戏标题标记，读前 4KB 判断）"""
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            return MARKER in resp.read(4096).decode('utf-8', 'ignore')
    except Exception:
        return False


def open_browser(url):
    if os.environ.get('BIF_NO_BROWSER'):
        print('[TEST] BIF_NO_BROWSER set - skip opening browser', flush=True)
        return
    webbrowser.open(url)


def main():
    # ① 首选端口已有本游戏服务器 → 直接复用（只开浏览器，不重复起服务）
    url0 = 'http://%s:%d' % (HOST, PORT_BASE)
    if game_serving_on(url0):
        print('Game server already running at %s - opening browser...' % url0, flush=True)
        open_browser(url0)
        return

    # ② 顺延扫描空闲端口（8765 被无关程序占用时自动换下一档，不再启动失败）
    server = None
    port = PORT_BASE
    for port in range(PORT_BASE, PORT_BASE + PORT_SPAN):
        try:
            server = ThreadingHTTPServer((HOST, port), NoCacheHandler)
            break
        except OSError:
            continue
    if server is None:
        try:   # 全忙兜底：交给系统自动分配
            server = ThreadingHTTPServer((HOST, 0), NoCacheHandler)
        except OSError as exc:
            print('')
            print('[ERROR] Cannot open any local port -> %s' % exc, flush=True)
            try:
                input('Press Enter to exit...')
            except (EOFError, KeyboardInterrupt):
                pass
            sys.exit(1)

    url = 'http://%s:%d' % (HOST, server.server_address[1])
    print('Serving %s  (Cache-Control: no-store; close this window to stop)' % url, flush=True)
    if port != PORT_BASE:
        print('[INFO] Port %d was busy (another program). Using %d instead - the URL has changed.' % (PORT_BASE, port), flush=True)
    open_browser(url)   # 服务就绪后再开浏览器
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
