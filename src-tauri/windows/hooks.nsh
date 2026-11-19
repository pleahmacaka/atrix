!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec '"$INSTDIR\atrix.exe" --default-app register'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::Exec '"$INSTDIR\atrix.exe" --default-app unregister'
    DeleteRegKey HKCU "Software\Classes\atrix-files"
  ${EndIf}
!macroend
