!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "¿Desea eliminar también la base de datos y todos los datos registrados de INVENTARIO CDS de este equipo?$\r$\n$\r$\n- Seleccione [SÍ] para borrar la base de datos por completo.$\r$\n- Seleccione [NO] para conservar los datos para futuras instalaciones." IDNO keepData
    RMDir /r "$APPDATA\inventario-cds"
    RMDir /r "$APPDATA\INVENTARIO CDS"
    RMDir /r "$LOCALAPPDATA\inventario-cds-updater"
    DetailPrint "Base de datos y datos de usuario eliminados."
    Goto done
  keepData:
    DetailPrint "Base de datos conservada en AppData."
  done:
!macroend
