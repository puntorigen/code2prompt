import sys
import subprocess
import json
import pkg_resources
import asyncio

def install_package(package_name):
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', package_name, '--no-input'])
        return f"Successfully installed {package_name}"
    except subprocess.CalledProcessError as e:
        return f"Error installing {package_name}: {str(e)}"

def is_package_installed(package_name):
    try:
        pkg_resources.get_distribution(package_name)
        return True
    except pkg_resources.DistributionNotFound:
        return False

def run_python_code(code, context_json='{}'):
    context = json.loads(context_json)
    namespace = {}
    namespace.update(context)

    def require(package_name):
        if not is_package_installed(package_name):
            install_package(package_name)
        return f"{package_name} is ready to use."

    # Add 'require' to the namespace
    namespace['require'] = require

    # We will wrap the user code in an async function, then run it with asyncio.run()
    # This allows using 'await' in the code and also capturing a 'return' value.
    # We'll place the user's code inside `__user_async_func` and then run it.
    
    # Indent user code by 4 spaces for the async function definition
    indented_code = "\n".join("    " + line for line in code.splitlines())

    async_wrapper = f"""
import asyncio

async def __user_async_func():
{indented_code}

result = asyncio.run(__user_async_func())
"""

    try:
        exec(async_wrapper, namespace)

        # The above code defines __user_async_func and runs it, storing its return value in `result`.
        # Now 'result' should be in namespace if the user code returned something.
        
        # Remove the non-serializable items like 'require'
        if 'require' in namespace:
            del namespace['require']

        # Filter out any non-serializable items
        def is_json_serializable(value):
            try:
                json.dumps(value)
                return True
            except:
                return False

        serializable_namespace = {k: v for k, v in namespace.items() if is_json_serializable(v)}

        return json.dumps(serializable_namespace)
    except Exception as e:
        return json.dumps({"error": str(e)})
