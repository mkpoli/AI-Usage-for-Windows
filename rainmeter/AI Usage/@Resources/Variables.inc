[Variables]
; Where AI Usage serves usage data. Turn the endpoint on under
; Settings > Desktop Widgets in the app.
APIRoot=http://127.0.0.1:6736

; Seconds between reads. The app refreshes providers on its own schedule, so
; polling faster than that only re-reads the same cached numbers.
UpdateSeconds=60

; Layout
SkinWidth=210
Padding=10
BarWidth=190
BarHeight=6

; Colours, as R,G,B,A
TitleColor=235,235,235,255
MutedColor=160,160,160,255
BarColor=222,115,86,255
BarBackColor=255,255,255,40
BackgroundColor=25,25,25,200

; Fonts
FontFace=Segoe UI
TitleSize=11
BodySize=8
