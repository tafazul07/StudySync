@echo off
echo Starting PDF RAG System...
echo.

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate

echo Installing dependencies...
pip install -q -r requirements.txt

echo Starting backend server...
cd backend
python main.py
