# Local static server for this app (no install needed). Opens http://localhost:<port>/
param([int]$Port = 8787, [switch]$NoBrowser)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$listener = New-Object System.Net.HttpListener
for ($p = $Port; $p -lt $Port + 20; $p++) {
  try { $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add("http://localhost:$p/"); $listener.Start(); $Port = $p; break } catch { }
}
if (-not $listener.IsListening) { Write-Host "Could not start server."; exit 1 }
$url = "http://localhost:$Port/"
Write-Host "Server running at $url  (close this window to stop)"
if (-not $NoBrowser) { Start-Process $url }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
