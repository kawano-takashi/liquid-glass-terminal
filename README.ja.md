<p align="center">
  <img src="assets/icons/icon.png" width="128" height="128" alt="Liquid Glass Terminal アイコン">
</p>

# Liquid Glass Terminal

Windows 11向けの、中性でCOSMIC風のフロステッドグラス表現を備えたローカル完結型Electronターミナルです。

> **プレビュー版:** v0.2.0の成果物は未署名です。実行前にソースとリリースのchecksumを確認してください。

[English](README.md) · [アーキテクチャ](docs/architecture.md) · [実機QA](docs/native-qa.md) · [セキュリティ](SECURITY.md)

## 特長

- `node-pty`による実ローカルシェルと、WebGL／DOM fallback対応のxterm.js描画。
- ドラッグ可能な複数タブ、Windows shell自動検出、検索、終了したshellの再起動。
- PowerShell 7、Windows PowerShell、cmd、Git Bash、WSL profile。
- 複数行paste確認、1 MiB超の必須確認、安全な外部リンク、実行しないファイル／フォルダーdrop。
- 日本語・英語、surfaceに応じて切り替わる前景色、設定とwindow位置の保存。
- telemetry、リモートコンテンツ、更新確認、crash upload、desktop capture、shell profileへのコード注入は一切なし。

## 対応環境

Liquid Glass Terminal 0.2.0は、Windows 11 22H2以降（build 22621以上）のx64クライアント版だけに対応します。Windows 10、Windows Server、Windows on ARM（x64 emulationを含む）、macOS、Linuxは、設定storeやPTYを作成する前に拒否します。

windowは通常どおりresize、maximize、Snapが可能です。client領域全体を覆うnative Windows Composition visualは`HostBackdrop → GaussianBlur（Quality、hard border）`だけを描画し、必要に応じて白または黒のcontrast spriteを重ねます。Electronはsystem materialを選択できますがblur量を指定できないため、この可変効果だけを小さなC++ Node-API境界に隔離しています。Electronが透過surfaceを作った直後にDWM system backdropを明示的に無効化します。画面収録の許可は要求せず、他windowのpixelをcapture、copy、保持しません。

「ガラスのコントラスト」は白−100%から中立0%、黒+100%まで5%刻みで変更でき、既定値は中立です。「曇りの強さ」は`0, 2, 3, 4, 5, 6, 9, 12, 16, 22, 30, 41, 55, 74` DIPの14段階から独立して選択でき、既定値は7段階目（9 DIP）です。1段階目はHostBackdropを維持したままGaussian blurを0 DIPにし、他の全段階と同じcontrastと前景色の規則を適用します。中立contrastではsharpでblurのない背後を表示します。contrastが±100%の両端では完全な不透明面となり、blurを迂回します。どの曇り段階でも白50%以上ではUI、titlebar symbol、xterm paletteをPTYの再作成なしで暗い前景色へ切り替えます。装飾用の静的noiseは表示しません。

高コントラスト、透明効果の低減、スクリーンリーダーモード、省電力、Remote Desktop、Windows効果の無効化時は、不透明な中性色面へ自動的に切り替えます。2本のappearance sliderには理由を表示して無効化し、保存値を維持して、policy解除時にfrostを復元します。起動時のnative初期化は1回だけ再試行し、2回とも失敗した場合も端末を不透明表示で起動して、再起動までlocalized error codeを常設表示します。実行中のcompositor障害では1回だけ再構築し、失敗後も既存PTYを維持したまま同じfallbackへ切り替えます。

## ローカル開発

必要な環境：

- Windows 11 22H2以降のx64クライアント版。
- Node.js **24.19.0** と npm **11.17.0**。
- Visual Studio 2022 Build Toolsの「C++によるデスクトップ開発」。

```powershell
npm ci
npm run audit:install-scripts
npm run bootstrap:native
npm start
```

`bootstrap:native`は固定versionのWindows SDK／C++/WinRT build headerを復元し、x64 Node-API frosted-backdrop addonをbuildして、`node-pty`をElectron ABI向けにrebuildします。package版はWindows 11のsystem Composition／Direct3D libraryだけを使い、Windows App SDK runtimeを同梱しません。

品質チェック：

```powershell
npm run check
$env:LGT_NATIVE_TESTS = '1'; npm run test:run
npm run package:e2e
npm run test:e2e
npm run make
npm run verify:native-assets
npm run verify:fuses
```

GitHub-hosted Windows runnerはWindows Serverであり、applicationが意図的に拒否するため、package版の起動／E2EはローカルWindows 11で実行します。OS clipboardのplain textを一時的に置換して復元するtestは、`LGT_CLIPBOARD_E2E=1`で有効になります。

## 使い方

package版が公開する引数は1つだけです。

```text
liquid-glass-terminal --cwd <directory>
```

相対pathは呼び出し元の作業directoryから解決します。無効なpathはhomeへfallbackし、通知を表示します。二重起動時は既存windowを前面へ出し、指定directoryで新しいtabを開きます。

### キーボード

| 操作               | shortcut                  |
| ------------------ | ------------------------- |
| tab追加／終了      | Ctrl+T / Ctrl+W           |
| 検索               | Ctrl+F                    |
| paste              | Ctrl+Shift+V              |
| copy               | 選択中のCtrl+C            |
| interrupt送信      | 未選択時のCtrl+C          |
| 次／前のtab        | Ctrl+Tab / Ctrl+Shift+Tab |
| active tab並べ替え | Alt+Shift+Left / Right    |
| 設定               | Ctrl+,                    |

リンクはCtrl+click時のみ、かつ`http:`／`https:`だけを開きます。dropしたpathはshell別にquoteされ、Enterを送らず現在位置へ挿入されます。

## buildとrelease

Electron Forgeは未署名のWindows x64 Setup EXEを生成します。一致する`v*` tagでWindows x64の品質checkを実行し、SHA-256 checksum付きDraft GitHub Releaseを作成します。署名、auto-update、session復元、SSH管理、split pane、任意custom profile、plugin、inline imageはv0.2.0の対象外です。

依存関係やnative codeを変更する前に[CONTRIBUTING.md](CONTRIBUTING.md)を確認してください。

## License

application codeは[MIT License](LICENSE)です。同梱するCascadia Mono PLはSIL Open Font Licenseです。[third-party notices](THIRD_PARTY_NOTICES.md)を参照してください。
