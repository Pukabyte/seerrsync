# Git Repository Setup

## Initial Setup

1. Configure git (if not already done):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```

   Or for this repository only:
   ```bash
   git config user.name "Your Name"
   git config user.email "your.email@example.com"
   ```

2. Create initial commit:
   ```bash
   git commit -m "Initial commit"
   ```

## Create Private GitHub Repository

1. Go to GitHub and create a new private repository (do NOT initialize with README, .gitignore, or license)

2. Add the remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

   Or if using SSH:
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

## Verify Sensitive Files Are Excluded

The following files should NOT be in the repository:
- `config.json` (use `config.json.example` instead)
- `docker-compose.yml` (use `docker-compose.yml.example` instead)

Verify with:
```bash
git ls-files | grep -E "(config\.json|docker-compose\.yml)$"
```

This should return nothing. If it does, those files are tracked and need to be removed from git history.
