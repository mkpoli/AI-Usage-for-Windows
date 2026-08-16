; One provider's usage, read from AI Usage over loopback.
; The skin that includes this file sets #Provider# to the provider id.

; ---------------------------------------------------------------------------
; Measures
; ---------------------------------------------------------------------------

; The endpoint answers with one `key=value` per line, always in this order, so
; the capture groups below stay put no matter how many buckets a provider has.
[MeasureUsage]
Measure=WebParser
URL=#APIRoot#/v1/rainmeter/#Provider#
UpdateRate=#UpdateSeconds#
RegExp=(?siU)^Id=(.*)\r?\nName=(.*)\r?\nPlan=(.*)\r?\nFetchedAt=(.*)\r?\nLabel=(.*)\r?\nPercent=(.*)\r?\nGatedPercent=(.*)\r?\nUsed=(.*)\r?\nLimit=(.*)\r?\nValue=(.*)\r?\nResetsAt=(.*)\r?\nResetsInSec=(.*)\r?\nBars=(.*)\r?\n

[MeasureProviderName]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=2

[MeasurePlan]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=3

[MeasureLabel]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=5

; Substitute keeps the Calc formulas below valid before any usage arrives.
[MeasurePercent]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=6
Substitute="":"0"

[MeasureValue]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=10

[MeasureResetsInSec]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=12
Substitute="":"0"

; No answer at all leaves this empty, which separates a closed app from a
; provider the app knows but has not measured yet.
[MeasureBars]
Measure=WebParser
URL=[MeasureUsage]
StringIndex=13
Substitute="":"-1"

[MeasureState]
Measure=Calc
Formula=[MeasureBars]
DynamicVariables=1
IfCondition=(MeasureState < 0)
IfTrueAction=[!ShowMeter MeterOffline][!HideMeter MeterWaiting][!HideMeterGroup Live][!Redraw]
IfCondition2=(MeasureState = 0)
IfTrueAction2=[!HideMeter MeterOffline][!ShowMeter MeterWaiting][!HideMeterGroup Live][!Redraw]
IfCondition3=(MeasureState > 0) && ([MeasureResetsInSec] > 0)
IfTrueAction3=[!HideMeter MeterOffline][!HideMeter MeterWaiting][!ShowMeterGroup Live][!ShowMeter MeterReset][!Redraw]
IfCondition4=(MeasureState > 0) && ([MeasureResetsInSec] = 0)
IfTrueAction4=[!HideMeter MeterOffline][!HideMeter MeterWaiting][!ShowMeterGroup Live][!HideMeter MeterReset][!Redraw]

; WebParser hands over strings; a Bar meter needs a number.
[MeasurePercentValue]
Measure=Calc
Formula=[MeasurePercent]
DynamicVariables=1
MinValue=0
MaxValue=100

[MeasureResetHours]
Measure=Calc
Formula=Floor([MeasureResetsInSec] / 3600)
DynamicVariables=1

[MeasureResetMinutes]
Measure=Calc
Formula=Floor(([MeasureResetsInSec] % 3600) / 60)
DynamicVariables=1

; ---------------------------------------------------------------------------
; Meters
; ---------------------------------------------------------------------------

[MeterBackground]
Meter=Shape
Shape=Rectangle 0,0,#SkinWidth#,76,6 | Fill Color #BackgroundColor# | StrokeWidth 0

[MeterProviderName]
Meter=String
MeasureName=MeasureProviderName
Group=Live
X=#Padding#
Y=8
FontFace=#FontFace#
FontSize=#TitleSize#
FontColor=#TitleColor#
StringStyle=Bold
AntiAlias=1

[MeterPlan]
Meter=String
MeasureName=MeasurePlan
Group=Live
X=#Padding#
Y=2R
FontFace=#FontFace#
FontSize=#BodySize#
FontColor=#MutedColor#
AntiAlias=1

[MeterBar]
Meter=Bar
MeasureName=MeasurePercentValue
Group=Live
X=#Padding#
Y=8R
W=#BarWidth#
H=#BarHeight#
BarColor=#BarColor#
SolidColor=#BarBackColor#
BarOrientation=Horizontal

[MeterLabel]
Meter=String
MeasureName=MeasureLabel
Group=Live
X=#Padding#
Y=6R
FontFace=#FontFace#
FontSize=#BodySize#
FontColor=#MutedColor#
AntiAlias=1

[MeterValue]
Meter=String
MeasureName=MeasureValue
Group=Live
X=#BarWidth#
Y=0r
StringAlign=Right
FontFace=#FontFace#
FontSize=#BodySize#
FontColor=#TitleColor#
AntiAlias=1

[MeterReset]
Meter=String
MeasureName=MeasureResetHours
MeasureName2=MeasureResetMinutes
Group=Live
X=#Padding#
Y=3R
Text=Resets in %1h %2m
FontFace=#FontFace#
FontSize=#BodySize#
FontColor=#MutedColor#
AntiAlias=1

[MeterOffline]
Meter=String
X=#Padding#
Y=8
W=#BarWidth#
Text=AI Usage is not serving on #APIRoot#
ClipString=1
FontFace=#FontFace#
FontSize=#BodySize#
FontColor=#MutedColor#
AntiAlias=1
Hidden=1

[MeterWaiting]
Meter=String
X=#Padding#
Y=8
W=#BarWidth#
Text=#Provider#: no usage to show yet
ClipString=1
FontFace=#FontFace#
FontSize=#BodySize#
FontColor=#MutedColor#
AntiAlias=1
Hidden=1
