import modal
from api.app import app as fastapi_app

# Create Modal app
modal_app = modal.App(name="panelpachi-api")

cache_volume = modal.Volume.from_name("cache-volume", create_if_missing=True)

# Create image with dependencies
image = (modal.Image.debian_slim(python_version="3.10")
         .apt_install("libgl1", "libglib2.0-0")
         .pip_install_from_requirements("requirements.txt")
         .add_local_dir(".", remote_path="/app")
         .add_local_python_source("_remote_module_non_scriptable", "app", "api", "models")
    )
    
@modal_app.function(
    image=image,
    gpu="T4",
    secrets=[modal.Secret.from_name("deepl-secret")],
    volumes={"/tmp/cache": cache_volume},
    environment_vars={"TRANSFORMERS_CACHE": "/cache"}
)
@modal.asgi_app()
def fastapi_endpoint():
    return fastapi_app

# Export the app for Modal to find
app = modal_app

