# 4 daily slots for scheduled automation. No-op outside window unless -Force.
# Slots: morning 9-10AM, afternoon 1-2PM, evening 6-7PM, overnight 10PM-1:30PM next day.
Set-StrictMode -Version Latest

function Get-AutoWindowSlots {
  return @(
    @{ Name = "morning";   Start = 9;  End = 10; Overnight = $false },
    @{ Name = "afternoon"; Start = 13; End = 14; Overnight = $false },
    @{ Name = "evening";   Start = 18; End = 19; Overnight = $false },
    @{ Name = "overnight"; Start = 22; End = 13.5; Overnight = $true }
  )
}

function Test-AutoWindow {
  param([switch]$Force, [ValidateSet("morning","afternoon","evening","overnight","all")][string]$Slot = "all")
  if ($Force) { return $true }

  $now = Get-Date
  $t = $now.TimeOfDay.TotalHours
  $slots = Get-AutoWindowSlots

  $inMorning   = ($t -ge 9  -and $t -lt 10)
  $inAfternoon = ($t -ge 13 -and $t -lt 14)
  $inEvening   = ($t -ge 18 -and $t -lt 19)
  $inOvernight = ($t -ge 22) -or ($t -lt 13.5)  # 10 PM - 1:30 PM next day (simplified: after 10PM or before 1:30PM)

  switch ($Slot) {
    "morning"   { return $inMorning }
    "afternoon" { return $inAfternoon }
    "evening"   { return $inEvening }
    "overnight" { return $inOvernight }
    "all"       { return ($inMorning -or $inAfternoon -or $inEvening -or $inOvernight) }
  }
  return $false
}
