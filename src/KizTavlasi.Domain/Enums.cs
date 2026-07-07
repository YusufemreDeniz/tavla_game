namespace KizTavlasi.Domain;

public enum RoomStatus
{
    Waiting = 0,
    InLobby = 1,
    Playing = 2,
    Completed = 3,
    Expired = 4,
    Abandoned = 5
}

public enum MatchStatus
{
    NotStarted = 0,
    StartingRoll = 1,
    InProgress = 2,
    Completed = 3
}

public enum RoundStatus
{
    NotStarted = 0,
    InProgress = 1,
    Completed = 2
}

public enum DiceStepAction
{
    Advance = 0,
    Collect = 1,
    CollectAll = 2,
    Wasted = 3
}
