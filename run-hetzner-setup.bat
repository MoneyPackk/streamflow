@echo off
cd /d "C:\Users\blazi\.zed\projects\streaming-platform"
echo StreamFlow - Hetzner Setup
echo ============================
echo.
echo A browser window will open to Hetzner.
echo.
echo Email: blazingscrubs@gmail.com
echo Name:  Money Pack
echo.
echo Steps to complete:
echo 1. Sign up for Hetzner Cloud (verify email + add payment)
echo 2. Create a project called "streamflow"
echo 3. Go to Security -^> API Tokens
echo 4. Create a token called "streamflow-deploy" with Read ^& Write
echo 5. Copy the token and paste it back to the AI
echo.
pause
node hetzner-setup.mjs
pause
