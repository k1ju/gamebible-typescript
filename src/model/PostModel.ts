export class PostModel {
    idx: string;
    userIdx: string;
    title: string;
    content?: string;
    nickname: string;
    createdAt: string;

    constructor(data: PostModel) {
        this.idx = data.idx;
        this.userIdx = data.userIdx;
        this.title = data.title;
        this.content = data.content;
        this.idx = data.nickname;
        this.createdAt = data.createdAt;
    }
}
