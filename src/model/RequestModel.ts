export class RequestModel {
    idx: string;
    userIdx: string;
    title: string;
    createdAt: string;

    constructor(data: RequestModel) {
        this.idx = data.idx;
        this.userIdx = data.userIdx;
        this.title = data.title;
        this.createdAt = data.createdAt;
    }
}
