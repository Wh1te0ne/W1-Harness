[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('daily', 'test')]
    [string]$Environment,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^w1-harness(?:-test)?://session/[A-Za-z0-9_%~-]+$')]
    [string]$SessionLink
)
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'Unexpected conversation-link arguments.' }
if (($Environment -eq 'test') -ne $SessionLink.StartsWith('w1-harness-test://', [StringComparison]::Ordinal)) {
    throw 'The conversation link belongs to another W1 environment.'
}
$entry = if ($SessionLink.StartsWith('w1-harness-test://', [StringComparison]::Ordinal)) { 'Start-W1Test.ps1' } else { 'Start-W1.ps1' }
& (Join-Path $PSScriptRoot $entry) -SessionLink $SessionLink
exit $LASTEXITCODE
