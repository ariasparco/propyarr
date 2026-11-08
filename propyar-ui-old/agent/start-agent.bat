@echo off
set PYTHONUNBUFFERED=1
set PYTHONIOENCODING=utf-8
cd /d "C:\propino\agent"
:loop
"C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe" mt5_agent.py >> "C:\propino\agent.log" 2>&1
echo [%date% %time%] agent stopped, restarting in 15s >> "C:\propino\agent.log"
timeout /t 15 /nobreak >nul
goto loop
