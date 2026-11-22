; Custom NSIS installer script for Screenwriter Pro
!include "x64.nsh"
!include "LogicLib.nsh"

; Custom pages
!define MUI_PAGE_CUSTOMFUNCTION_PRE onPageWelcome
!define MUI_PAGE_CUSTOMFUNCTION_PRE onPageDirectory

Function onPageWelcome
FunctionEnd

Function onPageDirectory
FunctionEnd

; Registry for file associations
Function WriteRegKeys
  WriteRegStr HKCR ".spro" "" "ScreenwriterPro.Script"
  WriteRegStr HKCR "ScreenwriterPro.Script" "" "Screenwriter Pro Script"
  WriteRegStr HKCR "ScreenwriterPro.Script\DefaultIcon" "" "$INSTDIR\Screenwriter Pro.exe,0"
  WriteRegStr HKCR "ScreenwriterPro.Script\shell\open\command" "" '"$INSTDIR\Screenwriter Pro.exe" "%1"'
FunctionEnd

Function UnWriteRegKeys
  DeleteRegKey HKCR ".spro"
  DeleteRegKey HKCR "ScreenwriterPro.Script"
FunctionEnd

; Custom install/uninstall functions
Function .onInstSuccess
  Call WriteRegKeys
FunctionEnd

Function un.onUninstSuccess
  Call UnWriteRegKeys
FunctionEnd