"""Schema checks on raw review records before they land in the raw layer.

Structural problems (no id, unparseable date, rating outside 1-5) are rejected with a
reason and written to the rejects table, so they are counted instead of silently lost.
Value normalization (e.g. 'Y' vs 'mandatory') belongs in dbt staging, not here.
"""

from datetime import datetime

from pydantic import BaseModel, Field, ValidationError, field_validator

Rating = Field(ge=1, le=5)


class Review(BaseModel):
    id: str = Field(min_length=1)
    professor_id: str = Field(min_length=1)
    date: str
    clarityRating: int = Rating
    helpfulRating: int = Rating
    difficultyRating: int = Rating
    wouldTakeAgain: int | None = Field(default=None, ge=0, le=1)

    @field_validator("date")
    @classmethod
    def date_parses(cls, v):
        datetime.strptime(v, "%Y-%m-%d %H:%M:%S %z UTC")
        return v


def split(rows):
    """Return (valid rows, rejected rows). Rejects keep the original record plus a reason."""
    valid, rejects = [], []
    for row in rows:
        try:
            Review.model_validate(row)
            valid.append(row)
        except ValidationError as e:
            reason = "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors())
            rejects.append({"reason": reason, "record": row})
    return valid, rejects
