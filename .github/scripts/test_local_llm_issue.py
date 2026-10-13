import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('agent', Path(__file__).with_name('local_llm_issue.py'))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class AgentSafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.root = Path(self.tmp.name).resolve()
        self.root_patch = patch.object(agent, 'ROOT', self.root)
        self.state_patch = patch.object(agent, 'STATE', self.root / '.state')
        self.root_patch.start()
        self.state_patch.start()

    def tearDown(self):
        self.state_patch.stop()
        self.root_patch.stop()
        self.tmp.cleanup()

    def test_rejects_traversal_workflow_credentials_and_config(self):
        for name in ['../escape.cs', '/tmp/escape.cs', 'src/../../escape.cs',
                     '.github/workflows/ci.yml', 'src/.env', 'src/Admin/package.json',
                     'tests/contracts/openapi.md', 'src\\Api\\foo.cs']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                agent.safe_path(name)

    def test_test_phase_cannot_modify_implementation(self):
        with self.assertRaises(ValueError):
            agent.apply_edits({'edits': [{'path': 'src/Api/Program.cs', 'content': 'bad'}]}, True)
        self.assertFalse((self.root / 'src').exists())

    def test_validates_entire_batch_before_any_write(self):
        with self.assertRaises(ValueError):
            agent.apply_edits({'edits': [{'path': 'tests/Regression.cs', 'content': 'ok'},
                {'path': '.github/workflows/ci.yml', 'content': 'bad'}]}, True)
        self.assertFalse((self.root / 'tests').exists())

    def test_symlink_cannot_escape_or_replace_existing_target(self):
        directory = self.root / 'src'
        directory.mkdir()
        try:
            (directory / 'link.cs').symlink_to(self.root / 'outside.cs')
        except OSError:
            self.skipTest('Symlinks unavailable on this host')
        with self.assertRaises(ValueError):
            agent.safe_path('src/link.cs')

    def test_acceptance_test_is_written_as_plain_data(self):
        agent.apply_edits({'edits': [{'path': 'src/Admin/example.test.ts',
                                    'content': 'test("example", () => {});'}]}, True)
        self.assertEqual((self.root / 'src/Admin/example.test.ts').read_text(), 'test("example", () => {});')

    def test_rejects_empty_duplicate_and_oversized_edits(self):
        edit = {'path': 'tests/Example.cs', 'content': 'ok'}
        for edits in [[], [edit, edit], [{'path': 'tests/Example.cs', 'content': 'x' * 100001}]]:
            with self.assertRaises(ValueError):
                agent.apply_edits({'edits': edits}, True)

    def test_failed_tests_block_publish_before_github_request(self):
        agent.save('issue', {'authorized': True})
        agent.save('green', {'exit_codes': [0, 1]})
        with patch.object(agent, 'gh') as github, self.assertRaises(ValueError):
            agent.publish()
        github.assert_not_called()

    def test_implementation_cannot_weaken_regression(self):
        agent.save('plan', {'files': ['tests/Regression.cs']})
        agent.save('issue', {})
        agent.save('red', {})
        (self.root / 'tests').mkdir()
        (self.root / 'tests/Regression.cs').write_text('original')
        with patch.object(agent.subprocess, 'run') as run, patch.object(agent, 'model') as model:
            run.return_value.stdout = b''
            model.return_value = {'edits': [{'path': 'tests/Regression.cs', 'content': 'weakened'}]}
            with self.assertRaises(ValueError):
                agent.generate('implement')
        self.assertEqual((self.root / 'tests/Regression.cs').read_text(), 'original')


if __name__ == '__main__':
    unittest.main()
