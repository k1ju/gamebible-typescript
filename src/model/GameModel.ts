export class GameModel {
    idx: string;
    userIdx: string;
    title: string;
    titleKor: string;
    titleEng: string;
    createdAt: string;
    deletedAt: string;

    constructor(data: GameModel) {
        this.idx = data.idx;
        this.userIdx = data.userIdx;
        this.title = data.title;
        this.titleKor = data.titleKor;
        this.titleEng = data.titleEng;
        this.createdAt = data.createdAt;
        this.deletedAt = data.deletedAt;
    }
}
