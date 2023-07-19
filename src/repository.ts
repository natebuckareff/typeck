export class Repository {
    private _ids: number;

    constructor() {
        this._ids = 0;
    }

    id(): number {
        return this._ids++;
    }
}
