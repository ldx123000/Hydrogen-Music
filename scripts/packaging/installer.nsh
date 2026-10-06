!include LogicLib.nsh

# Runs after extraction for both first installation and electron-updater upgrades.
# /EXE compression is a per-file property, so every installation must apply it again.
!macro customInstall
  Push $0
  Push $1
  Push $2
  Push $4

  FileOpen $4 "$INSTDIR\installation-compression.log" w
  System::Call 'kernel32::GetVolumePathNameW(w "$INSTDIR", w .r0, i ${NSIS_MAX_STRLEN}) i.r1'
  ${If} $1 == 0
    StrCpy $2 "Unable to find the installation volume."
    Goto hydrogen_compression_failed
  ${EndIf}
  System::Call 'kernel32::GetVolumeInformationW(w r0, p 0, i 0, p 0, p 0, p 0, w .r2, i ${NSIS_MAX_STRLEN}) i.r1'
  ${If} $1 == 0
    StrCpy $2 "Unable to identify the installation filesystem."
    Goto hydrogen_compression_failed
  ${EndIf}
  FileWrite $4 "filesystem=$2$\r$\n"
  ${If} $2 != "NTFS"
    DetailPrint "Transparent compression is unavailable on $2."
    FileWrite $4 "status=unsupported-filesystem$\r$\n"
    Goto hydrogen_compression_done
  ${EndIf}

  DetailPrint "Compressing application files..."
  FileClose $4
  nsExec::ExecToStack '"$SYSDIR\compact.exe" /C /S:"$INSTDIR" /EXE:LZX /A /Q "$INSTDIR\*"'
  Pop $1
  Pop $2
  FileOpen $4 "$INSTDIR\installation-compression.log" a
  FileSeek $4 0 END
  FileWrite $4 "$2$\r$\n"
  ${If} $1 != "0"
    StrCpy $2 "compact.exe failed (exit code $1)."
    Goto hydrogen_compression_failed
  ${EndIf}
  FileWrite $4 "status=compressed$\r$\nalgorithm=LZX$\r$\n"
  DetailPrint "Application files compressed."
  Goto hydrogen_compression_done

hydrogen_compression_failed:
  FileWrite $4 "status=failed$\r$\nerror=$2$\r$\n"
  FileClose $4
  MessageBox MB_OK|MB_ICONSTOP "$2$\r$\nSee $INSTDIR\installation-compression.log" /SD IDOK
  SetErrorLevel 1
  Abort

hydrogen_compression_done:
  FileClose $4
  Pop $4
  Pop $2
  Pop $1
  Pop $0
!macroend
