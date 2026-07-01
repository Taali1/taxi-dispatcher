@echo off
cls
echo ========================================
echo  BUILDING PRODUCTION VERSION
echo ========================================
echo.

npm run build

echo.
echo ========================================
echo  Build complete! Check /dist folder
echo ========================================
echo.
pause
