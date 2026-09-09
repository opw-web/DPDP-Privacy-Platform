@echo off
setlocal enabledelayedexpansion
rem ====================================================================
rem  4 - Show Demo Proof -- Windows launcher
rem
rem  This hands over to demo-control/show-demo-proof.sh, which is the very same
rem  script the Linux entry point in demo-control/linux/ runs. There
rem  is deliberately no second copy of the demo logic for Windows:
rem  one script, two platforms, nothing to drift out of sync.
rem
rem  All this file does is find Git Bash and start that script.
rem ====================================================================

set "ROOT=%~dp0"
set "SCRIPT=demo-control/show-demo-proof.sh"

rem --- Pick up a freshly installed Node / Python / Docker ---------------
rem Windows only hands a program the environment its parent had. File
rem Explorer captures PATH when it starts and keeps it until you log out,
rem so anything installed since then is invisible to a double-clicked
rem file -- the demo would report Node.js missing when it is installed.
rem Reading PATH back from the registry gives us what a fresh login would.
set "SYSP="
set "USRP="
for /f "tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /i "REG_"') do set "SYSP=%%B"
for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul ^| findstr /i "REG_"') do set "USRP=%%B"
call set "SYSP=%SYSP%"
call set "USRP=%USRP%"
if defined SYSP if defined USRP set "PATH=%SYSP%;%USRP%"
if defined SYSP if not defined USRP set "PATH=%SYSP%;%PATH%"
if not defined SYSP if defined USRP set "PATH=%USRP%;%PATH%"

rem --- Find Git Bash ---------------------------------------------------
set "GITBASH="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined GITBASH if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined GITBASH if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

rem Fall back to whatever is on PATH, but never Windows' own System32
rem bash.exe -- that one is the WSL launcher, not Git Bash.
if not defined GITBASH (
  for /f "delims=" %%i in ('where bash 2^>nul') do (
    if not defined GITBASH (
      echo %%i | findstr /i "\System32\" >nul || set "GITBASH=%%i"
    )
  )
)

if not defined GITBASH (
  echo.
  echo   Git for Windows is not installed.
  echo.
  echo   The demo controls run through Git Bash, which comes with
  echo   Git for Windows.
  echo.
  echo     1. Download it from  https://git-scm.com/download/win
  echo     2. Install it, accepting the default options.
  echo     3. Double-click this file again.
  echo.
  pause
  exit /b 1
)

rem --- Run it ----------------------------------------------------------
rem Forward slashes: bash handles a Windows drive path, but not backslashes.
set "ROOTFWD=%ROOT:\=/%"
"%GITBASH%" "%ROOTFWD%%SCRIPT%"
set "RC=%ERRORLEVEL%"

rem The demo scripts hold the window open themselves, on success and on
rem failure alike. The only case they cannot cover is bash failing to run
rem the script at all (126 = not executable, 127 = not found), which would
rem otherwise flash past. Pause for exactly that.
if "%RC%"=="126" goto :cantrun
if "%RC%"=="127" goto :cantrun
goto :done

:cantrun
echo.
echo   Could not run %SCRIPT%.
echo   The file may be missing or the download may be incomplete.
echo.
pause

:done
exit /b %RC%
