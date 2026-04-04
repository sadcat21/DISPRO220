$path = 'src\components\sectors\TodayCustomersDialog.tsx'
$content = Get-Content -Raw -Path $path

$content = $content -replace [regex]::Escape("const collectedAmount = Number(operation.amount_collected || 0);"), "const collectedAmount = Number(operation.amount_collected || 0);`r`n        const sector = customer?.sector_id ? sectors?.find((s) => s.id === customer.sector_id) : null;`r`n        const zone = (customer as any)?.zone_id ? allZones?.find((z) => z.id === (customer as any).zone_id) : null;"

$content = $content -replace [regex]::Escape('className="w-full p-3 text-right"'), 'className="w-full p-3 text-right hover:bg-muted/20 transition-colors"'

$content = $content -replace [regex]::Escape("customer_type: customer?.customer_type,`r`n                    }}`r`n                    compact`r`n                    hideBadges"), "customer_type: customer?.customer_type,`r`n                      sector_name: sector ? getLocalizedName(sector, language) : undefined,`r`n                      zone_name: zone ? getLocalizedName(zone, language) : undefined,`r`n                    }}`r`n                    compact"

$oldMeta = @'
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Ø¹Ø§Ù…Ù„ Ø§Ù„ØªØ­ØµÙŠÙ„: <span className="font-semibold text-foreground">{collectorName}</span></span>
                    <span>â€¢</span>
                    <span>
                      Ø§Ù„Ù…ÙˆØ¹Ø¯ Ø§Ù„Ù‚Ø§Ø¯Ù…:{' '}
                      <span className="font-semibold text-foreground">
                        {operation.next_due_date ? format(new Date(operation.next_due_date), 'dd/MM/yyyy HH:mm') : 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'}
                      </span>
                    </span>
                  </div>
'@

$newMeta = @'
                  <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                    <div className="rounded-xl bg-muted/40 px-2.5 py-1.5">
                      عامل التحصيل:{' '}
                      <span className="font-semibold text-foreground">{collectorName}</span>
                    </div>
                    <div className="rounded-xl bg-muted/40 px-2.5 py-1.5">
                      الموعد القادم:{' '}
                      <span className="font-semibold text-foreground">
                        {operation.next_due_date ? format(new Date(operation.next_due_date), 'dd/MM/yyyy HH:mm') : 'غير محدد'}
                      </span>
                    </div>
                  </div>
'@
$content = $content.Replace($oldMeta, $newMeta)

$oldUsage = '<CollectedDebtOperationList operations={collectedDebtOperations} emptyMessage="Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ­ØµÙŠÙ„Ø§Øª Ø¨Ø¹Ø¯" searchQuery={searchQuery} onOpenDetails={handleCollectedOperationClick} />'
$newUsage = '<CollectedDebtOperationList operations={collectedDebtOperations} emptyMessage="Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ­ØµÙŠÙ„Ø§Øª Ø¨Ø¹Ø¯" searchQuery={searchQuery} onOpenDetails={handleCollectedOperationClick} sectors={sectors} allZones={allZones} />'
$content = $content.Replace($oldUsage, $newUsage)

Set-Content -Path $path -Value $content
