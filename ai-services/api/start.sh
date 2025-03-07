#!/bin/bash
set -e  # Exit on error

# Check if Python is available and meets version requirements
check_python_version() {
    required_version="3.10.13"
    if ! command -v python &> /dev/null; then
        echo "Error: Python is not installed"
        exit 1
    fi
    
    current_version=$(python -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')
    if [[ "$(printf '%s\n' "$required_version" "$current_version" | sort -V | head -n1)" != "$required_version" ]]; then
        echo "Error: Python version $required_version or higher is required (current: $current_version)"
        exit 1
    fi
}

# Check if GPU is available for PyTorch
check_gpu() {
    if python -c "import torch; print(torch.cuda.is_available())" | grep -q "True"; then
        echo "GPU is available for PyTorch"
    else
        echo "Warning: GPU is not available. Running in CPU mode"
    fi
}

# Install uv if not present
install_uv() {
    if ! command -v uv &> /dev/null; then
        echo "Installing uv package manager..."
        pip install uv
    fi
}

# Main setup
main() {
    check_python_version
    install_uv

    # Create and activate virtual environment
    if [ ! -d ".venv" ]; then
        echo "Creating virtual environment..."
        uv venv
        echo "Virtual environment created"
    fi

    # Activate virtual environment
    source .venv/bin/activate

    # Check if requirements need to be installed
    if [ ! -f ".venv/installed_requirements" ] || [ requirements.txt -nt ".venv/installed_requirements" ]; then
        echo "Installing/updating requirements..."
        uv pip install -r requirements.txt
        touch .venv/installed_requirements
    fi

    # Check GPU availability
    check_gpu

    # Start the FastAPI server
    if [ -f "app.py" ]; then
        echo "Starting FastAPI server..."
        python app.py
    else
        echo "Error: app.py not found"
        exit 1
    fi
}

main