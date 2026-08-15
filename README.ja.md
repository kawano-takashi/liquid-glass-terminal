# Liquid Glass Terminal

[English](README.md)

ウィンドウ、Glassマテリアル、入力経路、シェルのライフサイクルをネイティブC++で実装した、Windows 11向けローカル完結型ターミナルです。Reactとxterm.jsは透明なWebView2 Composition Visual内で動作し、Electronは使用しません。

> **プレビュー:** バージョン0.3.0は、x64クライアント版Windows 11 24H2以降を対象とします。現在のインストーラーは未署名です。

## 0.3で変更した構成

- Win32の`HWND`と`WS_EX_NOREDIRECTIONBITMAP`がトップレベルウィンドウを所有し、リサイズ、最大化／復元、Snap Layout、システムメニュー、DPI、フルスクリーンを維持します。
- Windows.UI.Compositionが、ウィンドウ描画前のDesktop合成結果を常にGaussian Effectへ入力し、`glass.blurDips`で2〜74 DIPのぼかし量を選べます。処理済みの全画面Glass LayerのOpacityは常に1です。未加工のHostBackdrop出力は描画せず、アプリからPixelを読み取りまたは保存することもできません。
- `CoreWebView2CompositionController`により、透明なReact UIをネイティブVisualツリーへ直接配置します。マウス、ホイール、Pointer、Touch／Pen、Cursor、Focus、DPI、Drag & Drop、IMEに関係する入力はネイティブ側で転送します。
- C++20のConPTYホストが、kill-on-close Job Object内でローカルシェルを起動します。ターミナルデータは、上限付きQueue、Sequence検証、ACK、Recovery Generationを備えたWebView2 Shared Bufferで転送します。
- xterm.jsの表示経路では、Codexを含むTUIが出力するANSIのセル背景と反転表示を除去します。前景色、Cursor、Selectionは維持し、透明なGlass Surface上に描画します。
- Clear／Regular／Denseプリセットは、ぼかし量を6／30／55 DIPに設定します。CSSはDesktopをCaptureまたは画像処理せず、Glassの装飾はぼかし量に連動しません。
- High Contrast、透明効果無効、Remote Desktop、省電力、Composition障害、ユーザーによる無効化では、操作可能な単色表示へ切り替えます。可能な限りシェルを維持したままWebView2とGPUを復旧します。
- WebViewは同梱ファイルを`https://app.liquid-glass-terminal.invalid/`からのみ読み込みます。Navigation、Download、Permission、New Window、Remote Request、Host Object、およびRelease BuildのDevToolsは拒否します。

実装の詳細は[docs/architecture.md](docs/architecture.md)、ネイティブReleaseの合格基準は[docs/native-qa.md](docs/native-qa.md)を参照してください。

## 動作要件

### 実行

- x64クライアント版Windows 11 24H2（build 26100）以降。
- Microsoft Edge WebView2 Evergreen Runtime 150.0.4078.44以降。
- GlassにはHardware Accelerationが利用できるDesktop Composition環境。未対応またはPolicyで無効な環境では単色Fallbackを使用します。

Windows 10、Windows Server、Windows on ARM（x64 Emulationを含む）、macOS、Linuxには対応しません。

### 開発

- Node.js 24.19.0およびnpm 11.17.0を厳密に使用。
- Visual Studio 2022の**Desktop development with C++** workload。
- Windows SDK 10.0.26100.0。

## ビルドと起動

```powershell
npm ci
npm run verify:toolchain
npm run audit:install-scripts
npm run bootstrap:native
npm start
```

`.npmrc`によりLifecycle Scriptは常に無効です。`bootstrap:native`が固定VersionのWebView2、C++/WinRT、WIL packageを明示的にRestoreし、Native SolutionをBuildします。Release PackageはStatic WebView2 LoaderとWindows System APIを使用し、Electron、Node.js、Windows App SDK Runtime、Remote Contentを同梱しません。

## 品質ゲート

```powershell
# Format、Lint、TypeScript、Contract、Unit Test
npm run check

# Native Settings、Quoting、Clipboard、実ConPTY Test
$env:LGT_NATIVE_TESTS = '1'
npm run test:run

# 計測機能付きLocal E2E Package（Windows 11 Clientのみ）
npm run package:e2e
node scripts/verify-native-assets.mjs --e2e
npm run test:e2e

# Release検証前に計測機能なしPackageを再生成
npm run package
npm run verify:native-assets
npm run smoke:package
npm run audit:production
npm run make
npm run verify:installer
```

実Clipboard Testを意図的に実行する場合だけ`LGT_CLIPBOARD_E2E=1`を設定してください。OS ClipboardのPlain Textを一時的に置換し、終了時に復元します。`package:e2e`は別Compileされた実行ファイルでLoopback Inspectionを有効にするため、Release入力には使用できません。

Release用Stageは`build/package/LiquidGlassTerminal/`、`npm run make`で生成するMSIは`build/artifacts/LiquidGlassTerminal-0.3.0-win-x64.msi`です。

## 操作

- `Ctrl+Shift+C`: Terminal SelectionをCopy。
- `Ctrl+Shift+V`: Paste。複数行の場合は確認Dialogを表示。
- `Ctrl+C`: SelectionがあればCopy、なければShellへInterruptを送信。
- `Ctrl+,`: Settingsを開く。
- `F11`: Fullscreenの切り替え。`Esc`でFullscreenを終了。
- Local FileをTerminalへDropすると、Shellに適したQuote済みPathを挿入。

56 DIPのCustom Headerは操作ボタン以外をDragできます。最大化ボタンではWindows 11のSnap Layoutを維持し、FullscreenではHeader全体を非表示にします。

Settings v6、Window State v2、WebView2 Profile、Rotation付きDiagnostic Logは`%LOCALAPPDATA%\Liquid Glass Terminal`の下だけに保存します。以前のSettingsとVersion 1の配置ファイルは変更せず、移行にも使用しません。Telemetry、Analytics、Update Check、Runtime Content Downloadは行いません。

## Release状況

`v*` Tagは未署名x64 MSIをBuildし、SHA-256 Checksum付きDraft GitHub Releaseを作成します。公開前に、Maintainerが[docs/native-qa.md](docs/native-qa.md)の対応Client上Checklistを完了する必要があります。

## License

[MIT](LICENSE)。Cascadia Mono PLはSIL Open Font License 1.1で配布します。詳細は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
