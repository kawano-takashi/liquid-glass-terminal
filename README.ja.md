<p align="center">
  <img src="assets/icons/icon.png" width="128" height="128" alt="Liquid Glass Terminal アイコン">
</p>

# Liquid Glass Terminal

静かなリキッドグラス表現を備えた、ローカル完結型のElectronターミナルです。対応するWindows 11では公式Windows App SDKのAcrylic controller、macOSではVibrancyを利用し、Linuxと古いWindowsでは安定した疑似グラスへ切り替えます。

> **プレビュー版:** v0.1.0の成果物は未署名・未notarizeです。実行前にソースとリリースのchecksumを確認してください。

[English](README.md) · [アーキテクチャ](docs/architecture.md) · [実機QA](docs/native-qa.md) · [セキュリティ](SECURITY.md)

## 特長

- `node-pty`による実ローカルシェルと、WebGL／DOM fallback対応のxterm.js描画。
- ドラッグ可能な複数タブ、シェル自動検出、検索、終了したシェルの再起動。
- WindowsではPowerShell 7／Windows PowerShell／cmd／Git Bash／WSL、macOS/Linuxでは`$SHELL`／zsh／bashを検出。
- 複数行paste確認、1 MiB超の必須確認、安全な外部リンク、実行しないファイル／フォルダーdrop。
- 日本語・英語、システム／ライト／ダーク、3段階のグラス濃度、設定とウィンドウ位置の保存。
- 透明度低減、高コントラスト、動きの低減、任意のスクリーンリーダーモードへの対応。
- telemetry、リモートコンテンツ、更新確認、crash upload、shell profileへのコード注入は一切なし。

## 対応環境

| 環境    | 最低要件                   | 外観                                               | アーキテクチャ                 |
| ------- | -------------------------- | -------------------------------------------------- | ------------------------------ |
| Windows | Windows 10 x64             | Windows 11 22H2以降はAcrylic、それ以外は疑似グラス | x64                            |
| macOS   | macOS 12                   | native Vibrancy                                    | Intel x64、Apple Silicon arm64 |
| Linux   | Ubuntu 22.04以降／Fedora系 | 疑似グラス。GNOMEを主対象、KDEはbest effort        | x64                            |

LinuxとWindows 10では、背後のアプリが実際に透けることを保証しません。native実装はdesktop captureではなくcompositor backdropを使うため、画面収録の許可を要求せず、他windowのpixelも保持しません。全環境で通常のリサイズ可能なウィンドウを維持します。

## ローカル開発

必要な環境：

- Node.js **24.19.0** と npm **11.17.0**。
- Windows native build：Visual Studio 2022 Build Toolsの「C++によるデスクトップ開発」。`bootstrap:native`が固定versionのWindows App SDKを復元し、x64 Node-API addonをbuildして、自己完結runtimeをElectronの隣へ配置します。
- macOS native build：最新のXcode Command Line Tools。
- Linux native build：Python、`make`、C++ compiler、通常のElectron runtime libraries。

```powershell
npm install
npm run audit:install-scripts
npm run bootstrap:native
npm start
```

依存packageのlifecycle scriptは`.npmrc`で無効化しています。`audit:install-scripts`がreview済み・version固定のallowlistを検証し、`bootstrap:native`がElectron取得とElectron ABI向けPTY rebuildだけを明示的に実行します。

release前には`npm audit --omit=dev`が0件であることを必須にします。packaging専用の開発依存に関する警告の扱いは[セキュリティポリシー](SECURITY.md#dependency-audit-scope)を参照してください。

品質チェック：

```powershell
npm run check
npm run package
npm run test:e2e
```

native PTYを準備済みの場合は、`LGT_NATIVE_TESTS=1`で実shell integration testも有効になります。

## 使い方

package版が公開する引数は1つだけです。

```text
liquid-glass-terminal --cwd <directory>
```

相対パスは呼び出し元の作業directoryから解決します。無効なパスはhomeへfallbackし、通知を表示します。二重起動時は既存windowを前面へ出し、指定directoryで新しいtabを開きます。

### キーボード

| 操作               | Windows/Linux             | macOS                     |
| ------------------ | ------------------------- | ------------------------- |
| tab追加／終了      | Ctrl+T / Ctrl+W           | Cmd+T / Cmd+W             |
| 検索               | Ctrl+F                    | Cmd+F                     |
| paste              | Ctrl+Shift+V              | Cmd+V                     |
| copy               | 選択中のCtrl+C            | Cmd+C                     |
| interrupt送信      | 未選択時のCtrl+C          | Ctrl+C                    |
| 次／前のtab        | Ctrl+Tab / Ctrl+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab |
| active tab並べ替え | Alt+Shift+Left/Right      | Alt+Shift+Left/Right      |
| 設定               | Ctrl+,                    | Cmd+,                     |

リンクはCtrl/Cmd+click時のみ、かつ`http:`／`https:`だけを開きます。dropしたパスはshell別にquoteされ、Enterを送らず現在位置へ挿入されます。

## buildとrelease

Electron ForgeでWindows Setup EXE、macOS DMG/ZIP、Linux DEB/RPMを生成します。`v*` tagで全matrixを検証し、SHA-256 checksum付きDraft GitHub Releaseを作成します。署名、notarization、auto-update、session復元、SSH管理、split pane、任意custom profile、plugin、inline imageはv0.1.0の対象外です。

依存関係やnative codeを変更する前に[CONTRIBUTING.md](CONTRIBUTING.md)を確認してください。Liquid Glass TerminalはAppleおよびMicrosoftとは無関係の独立したsoftwareです。

## License

application codeは[MIT License](LICENSE)です。同梱するCascadia Mono PLはSIL Open Font Licenseです。[third-party notices](THIRD_PARTY_NOTICES.md)を参照してください。
