export default function (gulp, rootPath) {
  const fs = require('fs');
  const rimraf = require('rimraf');
  const mkdirp = require('mkdirp');
  const R = require('ramda');
  const Promise = require('songbird');
  const childProcess = require('child_process');

  const REPOS_CACHE = `${rootPath}/.projects-cache.json`;
  const REPOS_DIR = `${rootPath}/repos`;

  function loadReposFromGitHub() {
    const request = require('request');

    const REPOS = [
      {url:'https://api.github.com/orgs/syntaxhighlighter/repos?per_page=300'},
      {url:'https://api.github.com/repos/npedotnet/syntaxhighlighter-brush-mel', link_name:'brush-mel'},
      {url:'https://api.github.com/repos/npedotnet/syntaxhighlighter-theme-maya',link_name:'theme-maya'}
    ];
    var json;
    var repoIndex = 0;
    function requestJSON(resolve, reject) {
      const opts = {
        url: REPOS[repoIndex].url,
        json: true,
        headers: { 'User-Agent': 'node.js' },
      };
      request(opts, (err, response) => {
        if (err) return reject(err);
        if(REPOS[repoIndex].link_name) response.body.link_name = REPOS[repoIndex].link_name;
        if(json) json.push(response.body);
        else json = response.body;
        repoIndex++;
        if(repoIndex == REPOS.length) {
          fs.writeFile(REPOS_CACHE, JSON.stringify(json, null, 2));
          resolve(json);
        }
        else requestJSON(resolve, reject);
      });
    }
    return new Promise((resolve, reject) => requestJSON(resolve, reject));
  }

  const exec = (cmd, opts) =>
    Promise.resolve(cmd)
      .then(console.log)
      .then(() => childProcess.exec.promise(cmd, opts))
      .catch(err => { throw new Error(err.message + '\n\n' + cmd) });

  const git = (cmd, cwd) => exec(`git ${cmd}`, {cwd});
  const loadReposFromCache = () => fs.readFile.promise(REPOS_CACHE, 'utf8').then(JSON.parse);
  const loadRepos = () => loadReposFromCache().error(loadReposFromGitHub).then(R.map(R.pick(['clone_url', 'name', 'link_name'])));
  const cloneRepo = repo => git(`clone ${repo.clone_url}`, REPOS_DIR);
  const pathToRepo = repo => `${REPOS_DIR}/${repo.name}`;
  const ln = (source, dest) => rimraf.promise(dest).finally(() => exec(`ln -s ${source} ${dest} || true`));
  const linkNodeModulesIntoRepos = repo => ln(`${rootPath}/node_modules`, `${pathToRepo(repo)}/node_modules`);
  const linkReposIntoNodeModules = repo => {
    ln(pathToRepo(repo), `${rootPath}/node_modules/${repo.name}`);
    if(repo.link_name && repo.link_name !== repo.name) {
      ln(pathToRepo(repo), `${REPOS_DIR}/${repo.link_name}`);
      ln(pathToRepo(repo), `${rootPath}/node_modules/${repo.link_name}`);
    }
  }
  const unlinkReposFromNodeModules = repo => fs.promise.unlink(`${rootPath}/node_modules/${repo.name}`);

  gulp.task('setup-project:clone-repos', 'Clones all repositories from SyntaxHighlighter GitHub organization', () =>
    loadRepos()
      .then(R.filter(repo => !fs.existsSync(pathToRepo(repo))))
      .then(R.filter(repo => repo.name !== 'syntaxhighlighter'))
      .then(R.map(R.curry(cloneRepo)))
      .then(Promise.all)
  );

  gulp.task('setup-project:link-node_modules-into-repos', 'Links `./node_modules` into every cloned repository', ['setup-project:clone-repos'], () =>
    loadRepos()
      .then(R.filter(repo => repo.name !== 'syntaxhighlighter'))
      .then(R.map(R.curry(linkNodeModulesIntoRepos)))
      .then(Promise.all)
  );

  gulp.task('setup-project:link-repos-into-node_modules', 'Links every cloned repository into `./node_modules`', ['setup-project:clone-repos'], () =>
    loadRepos()
      .then(R.filter(repo => repo.name !== 'syntaxhighlighter'))
      .then(R.map(R.curry(linkReposIntoNodeModules)))
      .then(Promise.all)
  );

  gulp.task('setup-project:unlink-repos-from-node_modules', 'Unlinks every cloned repository from `./node_modules`', () =>
    loadRepos()
      .then(R.filter(repo => repo.name !== 'syntaxhighlighter'))
      .then(R.map(R.curry(unlinkReposFromNodeModules)))
      .then(Promise.all)
  );

  gulp.task(
    'setup-project',
    'Sets up project for development. RUN THIS FIRST!',
    [
      'setup-project:clone-repos',
      'setup-project:link-node_modules-into-repos',
      'setup-project:link-repos-into-node_modules'
    ]
  );
}
