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

$colorMatrix = New-Object System.Drawing.Imaging.ColorMatrix
$colorMatrix.Matrix00 = 0.299
$colorMatrix.Matrix01 = 0.299
$colorMatrix.Matrix02 = 0.299
$colorMatrix.Matrix10 = 0.587
$colorMatrix.Matrix11 = 0.587
$colorMatrix.Matrix12 = 0.587
$colorMatrix.Matrix20 = 0.114
$colorMatrix.Matrix21 = 0.114
$colorMatrix.Matrix22 = 0.114
$imageAttributes = New-Object System.Drawing.Imaging.ImageAttributes
$imageAttributes.SetColorMatrix($colorMatrix)
$canvasRect = New-Object System.Drawing.Rectangle 0, 0, 1024, 1024
$graphics.DrawImage(
  $sourceImage,
  $canvasRect,
  0,
  0,
  $sourceImage.Width,
  $sourceImage.Height,
  [System.Drawing.GraphicsUnit]::Pixel,
  $imageAttributes
)

$fontCollection = New-Object System.Drawing.Text.PrivateFontCollection
$fontCollection.AddFontFile($fontPath)
$fontFamily = $fontCollection.Families[0]
$glyphFont = New-Object System.Drawing.Font $fontFamily, 170, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat ([System.Drawing.StringFormat]::GenericTypographic)
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$glyphRect = New-Object System.Drawing.RectangleF 250, 390, 524, 244
$glyphBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 248, 248, 248))
$graphics.DrawString('>_', $glyphFont, $glyphBrush, $glyphRect, $format)

$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$glyphBrush.Dispose()
$format.Dispose()
$glyphFont.Dispose()
$fontCollection.Dispose()
$imageAttributes.Dispose()
$graphics.Dispose()
$canvas.Dispose()
$sourceImage.Dispose()

$node = (Get-Command node -ErrorAction Stop).Source
$converter = Join-Path $projectRoot 'node_modules/png2icons/png2icons-cli.js'
& $node $converter $outputPath $outputBase -icowe -bc -i
if ($LASTEXITCODE -ne 0) { throw "png2icons exited with code $LASTEXITCODE" }

Write-Output "Generated icon.png and icon.ico in $outputDirectory"
