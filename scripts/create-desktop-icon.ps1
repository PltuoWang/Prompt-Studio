$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskBuild=Join-Path $taskRoot 'build'
New-Item -ItemType Directory -Path $taskBuild -Force | Out-Null
$taskImages=@()
foreach($taskSize in @(16,24,32,48,64,128,256)) {
  $taskBitmap=[Drawing.Bitmap]::new($taskSize,$taskSize)
  $taskGraphics=[Drawing.Graphics]::FromImage($taskBitmap)
  $taskGraphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $taskGraphics.Clear([Drawing.Color]::Transparent)
  $taskGraphics.ScaleTransform($taskSize/256.0,$taskSize/256.0)
  $taskShape=[Drawing.Drawing2D.GraphicsPath]::new()
  $taskShape.AddArc(4,4,88,88,180,90);$taskShape.AddArc(164,4,88,88,270,90)
  $taskShape.AddArc(164,164,88,88,0,90);$taskShape.AddArc(4,164,88,88,90,90);$taskShape.CloseFigure()
  $taskBrush=[Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Point]::new(0,0),[Drawing.Point]::new(230,256),[Drawing.ColorTranslator]::FromHtml('#409cff'),[Drawing.ColorTranslator]::FromHtml('#0066cc'))
  $taskGraphics.FillPath($taskBrush,$taskShape)
  $taskPen=[Drawing.Pen]::new([Drawing.Color]::White,11)
  $taskPen.LineJoin=[Drawing.Drawing2D.LineJoin]::Round
  $taskTop=[Drawing.PointF[]]@([Drawing.PointF]::new(128,65),[Drawing.PointF]::new(200,101),[Drawing.PointF]::new(128,137),[Drawing.PointF]::new(56,101))
  $taskGraphics.DrawPolygon($taskPen,$taskTop)
  $taskGraphics.DrawLines($taskPen,[Drawing.PointF[]]@([Drawing.PointF]::new(56,135),[Drawing.PointF]::new(128,171),[Drawing.PointF]::new(200,135)))
  $taskGraphics.DrawLines($taskPen,[Drawing.PointF[]]@([Drawing.PointF]::new(56,169),[Drawing.PointF]::new(128,205),[Drawing.PointF]::new(200,169)))
  $taskMemory=[IO.MemoryStream]::new();$taskBitmap.Save($taskMemory,[Drawing.Imaging.ImageFormat]::Png)
  $taskImages+=,@{size=$taskSize;bytes=$taskMemory.ToArray()}
  if($taskSize -eq 256){[IO.File]::WriteAllBytes((Join-Path $taskBuild 'icon.png'),$taskMemory.ToArray())}
  $taskMemory.Dispose();$taskGraphics.Dispose();$taskBitmap.Dispose();$taskPen.Dispose();$taskBrush.Dispose();$taskShape.Dispose()
}
$taskStream=[IO.File]::Create((Join-Path $taskBuild 'icon.ico'));$taskWriter=[IO.BinaryWriter]::new($taskStream)
try {
  $taskWriter.Write([uint16]0);$taskWriter.Write([uint16]1);$taskWriter.Write([uint16]$taskImages.Count)
  $taskOffset=6+16*$taskImages.Count
  foreach($taskImage in $taskImages){$taskDimension=if($taskImage.size -eq 256){0}else{$taskImage.size};$taskWriter.Write([byte]$taskDimension);$taskWriter.Write([byte]$taskDimension);$taskWriter.Write([byte]0);$taskWriter.Write([byte]0);$taskWriter.Write([uint16]1);$taskWriter.Write([uint16]32);$taskWriter.Write([uint32]$taskImage.bytes.Length);$taskWriter.Write([uint32]$taskOffset);$taskOffset+=$taskImage.bytes.Length}
  foreach($taskImage in $taskImages){$taskWriter.Write([byte[]]$taskImage.bytes)}
} finally {$taskWriter.Dispose();$taskStream.Dispose()}
Write-Output 'Windows application icon created.'
