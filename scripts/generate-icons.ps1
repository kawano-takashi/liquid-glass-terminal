param(
  [string]$Source = 'assets/icons/icon-source.png',
  [string]$Font = 'src/renderer/assets/fonts/CascadiaMonoPL.ttf',
  [string]$Output = 'assets/icons/icon.png'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot $Source
$fontPath = Join-Path $projectRoot $Font
$outputPath = Join-Path $projectRoot $Output
$outputBase = [System.IO.Path]::Combine(
  [System.IO.Path]::GetDirectoryName($outputPath),
  [System.IO.Path]::GetFileNameWithoutExtension($outputPath)
)

if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing icon source: $sourcePath" }
if (-not (Test-Path -LiteralPath $fontPath)) { throw "Missing icon font: $fontPath" }

Add-Type -AssemblyName System.Drawing

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$canvas = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.DrawImage($sourceImage, 0, 0, 1024, 1024)

$fontCollection = New-Object System.Drawing.Text.PrivateFontCollection
$fontCollection.AddFontFile($fontPath)
$fontFamily = $fontCollection.Families[0]
$glyphFont = New-Object System.Drawing.Font $fontFamily, 126, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat ([System.Drawing.StringFormat]::GenericTypographic)
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$glyphRect = New-Object System.Drawing.RectangleF 306, 704, 412, 184
$shadowRect = New-Object System.Drawing.RectangleF 306, 710, 412, 184
$shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(126, 8, 6, 14))
$graphics.DrawString('>_', $glyphFont, $shadow, $shadowRect, $format)

$glyphBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $glyphRect,
  [System.Drawing.Color]::FromArgb(255, 178, 245, 255),
  [System.Drawing.Color]::FromArgb(255, 221, 190, 255),
  0
)
$graphics.DrawString('>_', $glyphFont, $glyphBrush, $glyphRect, $format)

$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$glyphBrush.Dispose()
$shadow.Dispose()
$format.Dispose()
$glyphFont.Dispose()
$fontCollection.Dispose()
$graphics.Dispose()
$canvas.Dispose()
$sourceImage.Dispose()

$node = (Get-Command node -ErrorAction Stop).Source
$converter = Join-Path $projectRoot 'node_modules/png2icons/png2icons-cli.js'
& $node $converter $outputPath $outputBase -allwe -bc -i
if ($LASTEXITCODE -ne 0) { throw "png2icons exited with code $LASTEXITCODE" }

Write-Output "Generated icon.png, icon.ico, and icon.icns in $outputDirectory"
