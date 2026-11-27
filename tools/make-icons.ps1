# Redraws the Android launcher icons and splash images with the Eyesight Checker logo.
# Every existing PNG keeps its size; only the picture changes.
# Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$res = Join-Path $PSScriptRoot '..\android\app\src\main\res' | Resolve-Path

$teal  = [System.Drawing.ColorTranslator]::FromHtml('#0f766e')
$dark  = [System.Drawing.ColorTranslator]::FromHtml('#062e2b')
$bg    = [System.Drawing.ColorTranslator]::FromHtml('#f3f6f8')
$white = [System.Drawing.Color]::White

function New-G($bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'
  return $g
}
# Eye from icon.svg (64-unit grid, centred on 32,32), drawn at unit size $u around centre ($cx,$cy)
function Draw-Eye($g, [double]$u, [double]$cx, [double]$cy) {
  function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ([float]($cx + ($x - 32) * $u)), ([float]($cy + ($y - 32) * $u)) }
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddBezier((P 8 32), (P 14 22), (P 22 16), (P 32 16))
  $path.AddBezier((P 32 16), (P 42 16), (P 50 22), (P 56 32))
  $path.AddBezier((P 56 32), (P 50 42), (P 42 48), (P 32 48))
  $path.AddBezier((P 32 48), (P 22 48), (P 14 42), (P 8 32))
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $white), $path)
  foreach ($c in @(@(32, 32, 10, $teal), @(32, 32, 4.5, $dark), @(35, 29, 2, $white))) {
    $r = $c[2] * $u
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $c[3]), [float]($cx + ($c[0] - 32) * $u - $r), [float]($cy + ($c[1] - 32) * $u - $r), [float](2 * $r), [float](2 * $r))
  }
}
function Fill-RoundRect($g, $brush, [double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc([float]$x, [float]$y, [float]$d, [float]$d, 180, 90)
  $p.AddArc([float]($x + $w - $d), [float]$y, [float]$d, [float]$d, 270, 90)
  $p.AddArc([float]($x + $w - $d), [float]($y + $h - $d), [float]$d, [float]$d, 0, 90)
  $p.AddArc([float]$x, [float]($y + $h - $d), [float]$d, [float]$d, 90, 90)
  $p.CloseFigure()
  $g.FillPath($brush, $p)
}
function Save-Png($bmp, $file) { $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }
function Size-Of($file) { $i = [System.Drawing.Image]::FromFile($file); $s = @($i.Width, $i.Height); $i.Dispose(); return $s }

$count = 0
Get-ChildItem $res -Recurse -Filter *.png | ForEach-Object {
  $file = $_.FullName; $name = $_.Name
  $w, $h = Size-Of $file
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = New-G $bmp
  switch -Wildcard ($name) {
    'ic_launcher.png' {          # legacy square icon
      $g.Clear([System.Drawing.Color]::Transparent)
      Fill-RoundRect $g (New-Object System.Drawing.SolidBrush $teal) 0 0 $w $h ($w * 14 / 64)
      Draw-Eye $g ($w / 64) ($w / 2) ($h / 2)
    }
    'ic_launcher_round.png' {    # legacy round icon
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.FillEllipse((New-Object System.Drawing.SolidBrush $teal), 0, 0, $w, $h)
      Draw-Eye $g ($w * 0.85 / 64) ($w / 2) ($h / 2)
    }
    'ic_launcher_foreground.png' { # adaptive icon layer: keep inside the 66/108 safe zone
      $g.Clear([System.Drawing.Color]::Transparent)
      Draw-Eye $g ($w * 0.0125) ($w / 2) ($h / 2)
    }
    'splash.png' {
      $g.Clear($bg)
      $s = [Math]::Min($w, $h) * 0.28
      Fill-RoundRect $g (New-Object System.Drawing.SolidBrush $teal) (($w - $s) / 2) (($h - $s) / 2) $s $s ($s * 14 / 64)
      Draw-Eye $g ($s / 64) ($w / 2) ($h / 2)
    }
    default { $g.Dispose(); $bmp.Dispose(); return }
  }
  $g.Dispose()
  Save-Png $bmp $file
  $count++
}
"Redrew $count images"
