import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

# Standard-library-only fixtures; never execute installed vendor tools.
# Run: python3 tests/test_devtools_local.py
SOURCE = pathlib.Path(os.environ.get(
    'DEVTOOLS_SCRIPT', pathlib.Path(__file__).resolve().parents[1] / 'scripts/devtools-check.sh'
)).resolve()
TOOLS = ['git','gh','docker','jq','rg','psql','just','fzf','fd','bat','aws','terraform','kubectl','vercel','pnpm','serve','supabase','node','npm']
CLIS = ['shadcn','eslint','next','tsc']

class LocalTools(unittest.TestCase):
    def run_fixture(self, mode, cwd_outside=False):
        with tempfile.TemporaryDirectory(prefix='dormy tools ') as tmp:
            root = pathlib.Path(tmp) / 'project with spaces'
            (root / 'scripts').mkdir(parents=True)
            script = root / 'scripts/devtools-check.sh'
            shutil.copyfile(SOURCE, script)
            bin = pathlib.Path(tmp) / 'fake-bin'; bin.mkdir()
            trace = pathlib.Path(tmp) / 'trace'
            def executable(path, content, chmod=True):
                path.write_text('#!/bin/sh\n' + content)
                if chmod: path.chmod(0o755)
            for tool in TOOLS + CLIS:
                executable(bin / tool, 'printf "stub version\\n"\n')
            executable(bin / 'npx', 'printf "npx:%s\\n" "$*" >> "$TRACE"\nexit 0\n')
            for cli in CLIS:
                executable(bin / cli, 'printf "global:%s\\n" "$0" >> "$TRACE"\n')
            local_bin = root / 'node_modules/.bin'; local_bin.mkdir(parents=True)
            for cli in CLIS:
                if mode == 'missing': continue
                target = root / (cli + ' target') if mode == 'symlink' else local_bin / cli
                executable(target, f'printf "local:{cli}:%s\\n" "$*" >> "$TRACE"\nexit '+('7' if mode == 'failed' else '0')+'\n', mode != 'nonexecutable')
                if mode == 'symlink': (local_bin / cli).symlink_to(target)
            env = {'PATH':str(bin)+':/usr/bin:/bin', 'TRACE':str(trace)}
            result = subprocess.run(['/bin/bash', str(script)], cwd=tmp if cwd_outside else root,
                                    env=env, capture_output=True, text=True, timeout=10)
            return result, trace.read_text() if trace.exists() else ''
    def test_missing_is_reported_without_package_runner(self):
        result, trace = self.run_fixture('missing')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('npx:', trace)
        for cli in CLIS: self.assertIn('MISSING: project-local '+cli, result.stdout)
    def test_nonexecutable_is_reported_without_package_runner(self):
        result, trace = self.run_fixture('nonexecutable')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace, '')
        for cli in CLIS: self.assertIn('MISSING: project-local '+cli, result.stdout)
    def test_installed_versions_run_with_expected_argument(self):
        result, trace = self.run_fixture('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace.splitlines(), ['local:'+cli+':--version' for cli in CLIS])
    def test_other_working_directory_and_spaces(self):
        result, trace = self.run_fixture('success', cwd_outside=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace.splitlines(), ['local:'+cli+':--version' for cli in CLIS])
    def test_symlinked_local_tools_are_used(self):
        result, trace = self.run_fixture('symlink', cwd_outside=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace.splitlines(), ['local:'+cli+':--version' for cli in CLIS])
    def test_failed_tool_warns_and_continues(self):
        result, trace = self.run_fixture('failed')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace.splitlines(), ['local:'+cli+':--version' for cli in CLIS])
        for cli in CLIS: self.assertIn('WARN: project-local '+cli+' not runnable', result.stdout)

if __name__ == '__main__': unittest.main()
