export enum SortOrderType {
    Ascending = 'Ascending',
    Descending = 'Descending',
}

export const getSortOrderType = (st: string): SortOrderType => {
    switch (st) {
        case 'Ascending':
            return SortOrderType.Ascending
        case 'Descending':
            return SortOrderType.Descending
        default:
            return SortOrderType.Ascending
    }
}

export enum StorageType {
    File = 'File',
    GitHubRepo = 'GitHub Repo',
    GitHubGist = 'GitHub Gist',
    GitlabRepo = 'Gitlab Repo',
    S3 = 'S3',
}

export const getStorageType = (st: string): StorageType => {
    switch (st) {
        case 'File':
            return StorageType.File
        case 'GitHub Repo':
            return StorageType.GitHubRepo
        case 'GitHub Gist':
            return StorageType.GitHubGist
        case 'Gitlab Repo':
            return StorageType.GitlabRepo
        case 'S3':
            return StorageType.S3
        default:
            return StorageType.File
    }
}
