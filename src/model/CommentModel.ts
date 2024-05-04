export class CommentModel {
    idx: string;
    postIdx: string;
    userIdx: string;
    content: string;
    createdAt: string;
    deletedAt: string;

    constructor(data: CommentModel) {
        this.idx = data.idx;
        this.postIdx = data.postIdx;
        this.userIdx = data.userIdx;
        this.content = data.content;
        this.createdAt = data.createdAt;
        this.deletedAt = data.deletedAt;
    }
}
