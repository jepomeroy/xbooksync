import { loginWithGitHubApp, INSTALL_URL, type DeviceCodePrompt } from '@/entrypoints/bookmarks/gh-app-auth'
import { FaGithub } from 'react-icons/fa6'

import './gh-storage.css'
import { ghAuthToken, ghRepo, ghUsername } from '@/entrypoints/shared/localsettings'
import { AppNotInstalledError, fetchGitHubRepos } from './gh-utils'

/**
 * Settings for the local-file sync target. Fully controlled — it holds no state
 * of its own, so the parent owns both the value and the debounced write.
 */
export default function GitHubSettings() {
    const [prompt, setPrompt] = useState<DeviceCodePrompt | null>(null)
    const [status, setStatus] = useState<string>('')
    const [token, setToken] = useState<string>('')
    const [repo, setRepo] = useState<string>('')
    const [repos, setRepos] = useState<string[]>([])
    const [needsInstall, setNeedsInstall] = useState(false)
    // Bumped to re-run the repo fetch after the user installs the app, which
    // happens on github.com and so can't notify us on its own.
    const [refresh, setRefresh] = useState(0)

    // Hydrate from token on mount.
    useEffect(() => {
        ghAuthToken.getValue().then(data => setToken(data))
        ghRepo.getValue().then(data => setRepo(data))
    }, [])

    // Load the repo list once there's a token to load it with. Clearing on
    // revoke is handled there rather than here, so the effect never sets state
    // synchronously.
    useEffect(() => {
        if (token === '') return

        let cancelled = false

        fetchGitHubRepos(token)
            .then(names => {
                if (cancelled) return

                setRepos(names)
                // A recheck that succeeds has to take the prompt down itself —
                // the visibility-driven path never cleared it on the way in.
                setNeedsInstall(false)
                // Reaching here means the token works *and* the app is installed,
                // which is the only point at which "connected" is honest. Set on
                // every load, not just at login, so it survives a reload.
                setStatus('Connected to GitHub.')
            })
            .catch(error => {
                if (cancelled) return

                // A missing installation isn't a failure the user can read their
                // way out of, so it gets the install prompt instead of the
                // status line.
                if (error instanceof AppNotInstalledError) {
                    setNeedsInstall(true)
                    // Drop any stale "Connected" left over from a previous load.
                    setStatus('')
                } else {
                    setStatus(error instanceof Error ? error.message : String(error))
                }
            })

        return () => {
            cancelled = true
        }
    }, [token, refresh])

    // The install happens on github.com in another tab, so the user returning to
    // this page is the only signal we get that it might be done. Only listen
    // while we're actually waiting on one.
    useEffect(() => {
        if (!needsInstall) return

        const recheck = () => {
            if (!document.hidden) setRefresh(count => count + 1)
        }

        document.addEventListener('visibilitychange', recheck)

        return () => document.removeEventListener('visibilitychange', recheck)
    }, [needsInstall])

    const handleButtonClick = () => {
        if (token === '') {
            loginWithGitHub()
        } else {
            revokeToken()
        }
    }

    const handleInstallClick = () => {
        browser.tabs.create({ url: INSTALL_URL })
    }

    /** Re-runs the repo fetch once the user has finished installing on GitHub. */
    const handleRecheckClick = () => {
        setNeedsInstall(false)
        setStatus('')
        setRefresh(count => count + 1)
    }

    const handleRepoChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const repo = e.target.value
        const username = repo.split('/')[0]

        if (username) {
            await ghUsername.setValue(username)
        }

        setRepo(repo)
        await ghRepo.setValue(repo)
    }

    const loginWithGitHub = async () => {
        setStatus('')
        setPrompt(null)

        try {
            const token = await loginWithGitHubApp(next => {
                setPrompt(next)
                // The user has to enter the code on GitHub, so send them there.
                browser.tabs.create({ url: next.verificationUri })
            })
            setToken(token)
            setPrompt(null)
            // No "Connected" here — a token alone doesn't mean the app can reach
            // anything. The repo fetch this kicks off decides that.
        } catch (error) {
            setPrompt(null)
            setStatus(error instanceof Error ? error.message : String(error))
        }
    }

    const revokeToken = () => {
        ghAuthToken.removeValue()
        ghRepo.removeValue()
        setToken('')
        setRepo('')
        setRepos([])
        setNeedsInstall(false)
        setStatus('')
    }

    return (
        <>
            {/* Button and messages are direct children of the .storage-setting
                grid, so they land in its two columns side by side. Wrapping them
                together would make them one item and stack them instead. */}
            <button
                className='gh-login'
                onClick={handleButtonClick}
                aria-label='Login with GitHub'
                title='Login with GitHub'
            >
                <div className='button-text'>
                    <FaGithub />
                    {token === '' ? 'Login With GitHub' : 'Revoke Token'}
                </div>
            </button>
            <div className='gh-messages'>
                {prompt && (
                    <p className='prompt'>
                        Enter code <strong>{prompt.userCode}</strong> at{' '}
                        <a href={prompt.verificationUri} target='_blank' rel='noreferrer'>
                            {prompt.verificationUri}
                        </a>
                    </p>
                )}
                {needsInstall && (
                    <div className='needs-install' role='status'>
                        <p>
                            Connected, but the app isn&apos;t installed on any account yet — that&apos;s what grants
                            access to your repos.
                        </p>
                        <div className='needs-install-actions'>
                            <button onClick={handleInstallClick}>Install on GitHub</button>
                            <button onClick={handleRecheckClick}>I&apos;ve installed it</button>
                        </div>
                    </div>
                )}
                {status && (
                    <p className='status' role='status'>
                        {status}
                    </p>
                )}
            </div>
            {token && (
                <div className='setting gh-repo-setting'>
                    <label htmlFor='gh-repo'>GitHub Repo</label>
                    <select
                        id='gh-repo'
                        value={repo}
                        onChange={handleRepoChange}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px' }}
                    >
                        <option value=''>{repos.length === 0 ? 'Loading repos…' : 'Select a repo'}</option>
                        {repos.map(name => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </>
    )
}
