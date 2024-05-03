export class UserModel {
    idx: string;
    is_admin: string;
    nickname: string;
    email: string;
    created_at: string;
    deleted_at: string;

    constructor(data: UserModel) {
        this.idx = data.idx;
        this.nickname = data.nickname;
        this.email = data.email;
        this.is_admin = data.is_admin;
        this.created_at = data.created_at;
        this.deleted_at = data.deleted_at;
    }
}
