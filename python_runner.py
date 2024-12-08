import sys
import subprocess
import json
import pkg_resources
import asyncio
import os
import io

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

    def embed_file(filepath):
        # Use templateDir as the base directory if provided, else use current script dir
        base_dir = namespace.get('templateDir', os.path.dirname(os.path.abspath(__file__)))
        abs_path = os.path.join(base_dir, filepath)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"Cannot embed file: {abs_path} does not exist.")

        with open(abs_path, 'r', encoding='utf-8') as f:
            script_code = f.read()

        exec(script_code, namespace)
        return f"Embedded {filepath}"

    def require(package_or_path):
        # Determine if this is a package or a file
        if package_or_path.endswith('.py') or package_or_path.startswith('.') or package_or_path.startswith('/'):
            # Treat as file
            return embed_file(package_or_path)
        else:
            # treat as package
            if not is_package_installed(package_or_path):
                install_result = install_package(package_or_path)
                return install_result
            return f"{package_or_path} is ready to use."

    namespace['require'] = require

    # Indent user code by 4 spaces for the async function definition
    indented_code = "\n".join("    " + line for line in code.splitlines())

    async_wrapper = f"""
import asyncio

async def __user_async_func():
{indented_code}

result = asyncio.run(__user_async_func())
"""

    # Capture stdout
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        exec(async_wrapper, namespace)

        captured_stdout = sys.stdout.getvalue()

        # Remove 'require' if not needed in the final output
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

        # Include captured stdout
        serializable_namespace['__captured_stdout__'] = captured_stdout

        return json.dumps(serializable_namespace)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        # Restore original stdout
        sys.stdout = old_stdout
