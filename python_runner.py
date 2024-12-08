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

class silence:
    def __enter__(self):
        self._old_stdout = sys.stdout
        self._old_stderr = sys.stderr
        self._buffer = io.StringIO()
        sys.stdout = self._buffer
        sys.stderr = self._buffer
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout = self._old_stdout
        sys.stderr = self._old_stderr
        self._captured_value = self._buffer.getvalue()
        return False
    def __str__(self):
        return self._captured_value

def run_python_code(code, context_json='{}'):
    context = json.loads(context_json)
    namespace = {}
    namespace.update(context)

    # Store original stdout/stderr before we do any capturing
    original_stdout = sys.stdout
    original_stderr = sys.stderr

    def embed_file(filepath):
        base_dir = namespace.get('templateDir', os.path.dirname(os.path.abspath(__file__)))
        abs_path = os.path.join(base_dir, filepath)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"Cannot embed file: {abs_path} does not exist.")

        with open(abs_path, 'r', encoding='utf-8') as f:
            script_code = f.read()

        exec(script_code, namespace)
        return f"Embedded {filepath}"

    def require(package_or_path):
        # If argument looks like a file path, embed it; else treat as a package
        if package_or_path.endswith('.py') or package_or_path.startswith('.') or package_or_path.startswith('/'):
            return embed_file(package_or_path)
        else:
            if not is_package_installed(package_or_path):
                install_result = install_package(package_or_path)
                return install_result
            return f"{package_or_path} is ready to use."

    def printit(*args, sep=' ', end='\n', file=None):
        # Print directly to original_stdout, bypassing any capturing
        message = sep.join(str(a) for a in args) + end
        original_stdout.write(message)
        original_stdout.flush()

    # Add everything to the namespace
    namespace['require'] = require
    namespace['silence'] = silence
    namespace['printit'] = printit
    namespace['print'] = printit  # Override print to use printit

    indented_code = "\n".join("    " + line for line in code.splitlines())
    async_wrapper = f"""
import asyncio

async def __user_async_func():
{indented_code}

result = asyncio.run(__user_async_func())
"""

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()

    try:
        exec(async_wrapper, namespace)

        captured_stdout = sys.stdout.getvalue()
        captured_stderr = sys.stderr.getvalue()

        if 'require' in namespace:
            del namespace['require']
        # 'silence', 'printit', and 'print' can remain if desired

        def is_json_serializable(value):
            try:
                json.dumps(value)
                return True
            except:
                return False

        serializable_namespace = {k: v for k, v in namespace.items() if is_json_serializable(v)}
        serializable_namespace['python_stdout'] = captured_stdout
        serializable_namespace['python_stderr'] = captured_stderr

        return json.dumps(serializable_namespace)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
