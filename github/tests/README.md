# GitHub Release 回归测试

在仓库根目录运行（建议 Node.js 24+）：

```sh
npm --prefix github/tests install
npm --prefix github/tests test
```

真实浏览器引擎测试：

```sh
github/tests/node_modules/.bin/playwright install chromium firefox webkit
npm --prefix github/tests run test:browser
```

测试包含普通 `li`、ARIA 列表、`Box-row` 布局、仓库保存的 GitHub DOM 样本，以及 320px 触屏、动态加载、重排、折叠和代理菜单。浏览器测试执行完整用户脚本，但用本地 HTML 代替网络响应，不加载样本内的外部脚本。

可选的真实 GitHub 页面检查（Git Bash）：

```sh
BROWSER_ENGINES=chromium LIVE_GITHUB=1 npm --prefix github/tests run test:browser
```

这一步需要能访问 GitHub。WebKit 引擎测试不等同于 iPhone/iPad 上 Safari 和用户脚本管理器的真机测试。完全不含受支持列表结构的布局会保持原样，不进行破坏性的猜测重排。
