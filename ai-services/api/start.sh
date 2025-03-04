#!/bin/bash

# Activate virtual environment if it exists, otherwise suggest creating one
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "Activated virtual environment"
else
    echo "No virtual environment found. Creating one..."
    python -m venv .venv
    source .venv/bin/activate
    echo "Virtual environment created and activated"
    echo "Installing requirements..."
    pip install -r requirements.txt
fi

# Start the FastAPI server
python app.py 