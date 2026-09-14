'use strict';
// Paths arrive as JSON data, never as PowerShell expressions. The helper lives outside the installed app.
function windowsCommand(config) {
  const literal = config.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:PSModulePath = [IO.Path]::Combine($env:SystemRoot, 'System32\\WindowsPowerShell\\v1.0\\Modules')
$plan = Get-Content -Encoding UTF8 -LiteralPath '${literal}' -Raw | ConvertFrom-Json
[IO.File]::WriteAllText($plan.ready, 'READY')
try {
  for ($i=0; $i -lt 300; $i++) {
    if (-not (Get-Process -Id $plan.parentPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-Process -Id $plan.parentPid -ErrorAction SilentlyContinue) { throw 'App did not exit' }
  $arguments = '/S --updated --keep-shortcuts /D=' + $plan.root
  $installer = Start-Process -FilePath $plan.file -ArgumentList $arguments -PassThru -Wait
  if ($installer.ExitCode -notin @(0,3010)) { throw 'Installer failed or was cancelled' }
  $result = @{ ok = $true }
} catch {
  [IO.File]::AppendAllText($plan.log, $_.Exception.ToString())
  $result = @{ ok = $false; error = '安装被取消或失败，请重试' }
}
[IO.File]::WriteAllText($plan.result, ($result | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$restart = @('--updated') + @($plan.restartArgs | Where-Object { $_ })
Start-Process -FilePath $plan.executable -ArgumentList $restart
`;
}
module.exports = { windowsCommand };
