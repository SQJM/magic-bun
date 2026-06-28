$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent

$command = "bun `"$scriptDir\index.ts`" $args"

Invoke-Expression $command