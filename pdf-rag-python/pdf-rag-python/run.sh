#!/bin/bash
# Run script for PDF RAG System

echo "🚀 Starting PDF RAG System..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

echo "🔧 Activating virtual environment..."
source venv/bin/activate

echo "📥 Installing dependencies..."
pip install -q -r requirements.txt

echo "🌐 Starting backend server..."
cd backend
python main.py &
BACKEND_PID=$!

echo ""
echo "✅ Backend running at http://localhost:8000"
echo "📝 Open frontend/index.html in your browser"
echo ""
echo "Press Ctrl+C to stop"

wait $BACKEND_PID
