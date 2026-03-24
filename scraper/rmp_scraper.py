import requests
import json
import pandas as pd
import time
import os

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Authorization": "Basic dGVzdDp0ZXN0"
}

UCSD_ID = "U2Nob29sLTEwNzk="

def get_professors(school_id, limit=1000):
    professors = []
    cursor = ""
    print("Fetching professors...")
    
    while True:
        query = """
        query TeacherSearchPaginationQuery($count: Int!, $cursor: String, $query: TeacherSearchQuery!) {
          search: newSearch {
            teachers(query: $query, first: $count, after: $cursor) {
              edges {
                node {
                  id
                  firstName
                  lastName
                  department
                  avgRating
                  avgDifficulty
                  numRatings
                  wouldTakeAgainPercent
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        """
        variables = {
            "count": 20,
            "cursor": cursor,
            "query": {"schoolID": school_id, "fallback": True}
        }
        
        try:
            r = requests.post(
                "https://www.ratemyprofessors.com/graphql",
                json={"query": query, "variables": variables},
                headers=HEADERS,
                timeout=10
            )
            data = r.json()
            edges = data["data"]["search"]["teachers"]["edges"]
            page_info = data["data"]["search"]["teachers"]["pageInfo"]
            
            for edge in edges:
                node = edge["node"]
                professors.append({
                    "id": node["id"],
                    "name": f"{node['firstName']} {node['lastName']}",
                    "department": node.get("department", ""),
                    "avg_rating": node.get("avgRating", 0),
                    "avg_difficulty": node.get("avgDifficulty", 0),
                    "num_ratings": node.get("numRatings", 0),
                    "would_take_again": node.get("wouldTakeAgainPercent", 0)
                })
            
            print(f"Fetched {len(professors)} professors so far...")
            
            if not page_info["hasNextPage"] or len(professors) >= limit:
                break
            cursor = page_info["endCursor"]
            time.sleep(0.5)
            
        except Exception as e:
            print(f"Error fetching professors: {e}")
            break
    
    return professors

def get_reviews(professor_id, professor_name, limit=20):
    reviews = []
    cursor = ""
    
    query = """
    query RatingsListQuery($count: Int!, $id: ID!, $cursor: String) {
      node(id: $id) {
        ... on Teacher {
          ratings(first: $count, after: $cursor) {
            edges {
              node {
                comment
                class
                date
                helpfulRating
                clarityRating
                difficultyRating
                wouldTakeAgain
                grade
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
    """
    
    variables = {"count": limit, "id": professor_id, "cursor": cursor}
    
    try:
        r = requests.post(
            "https://www.ratemyprofessors.com/graphql",
            json={"query": query, "variables": variables},
            headers=HEADERS,
            timeout=10
        )
        data = r.json()
        edges = data["data"]["node"]["ratings"]["edges"]
        
        for edge in edges:
            node = edge["node"]
            if node.get("comment", "").strip():
                reviews.append({
                    "professor": professor_name,
                    "class": node.get("class", ""),
                    "comment": node.get("comment", "").strip(),
                    "helpful": node.get("helpfulRating", 0),
                    "clarity": node.get("clarityRating", 0),
                    "difficulty": node.get("difficultyRating", 0),
                    "would_take_again": node.get("wouldTakeAgain", False),
                    "grade": node.get("grade", "")
                })
    except Exception as e:
        print(f"Error fetching reviews for {professor_name}: {e}")
    
    return reviews

def scrape_ucsd(max_professors=100, reviews_per_prof=15):
    professors = get_professors(UCSD_ID, limit=max_professors)
    print(f"\nFetched {len(professors)} professors. Now fetching reviews...")
    
    all_reviews = []
    prof_df = pd.DataFrame(professors)
    
    for i, prof in enumerate(professors[:max_professors]):
        if prof["num_ratings"] < 3:
            continue
        reviews = get_reviews(prof["id"], prof["name"], limit=reviews_per_prof)
        for r in reviews:
            r["department"] = prof["department"]
            r["avg_rating"] = prof["avg_rating"]
            r["avg_difficulty"] = prof["avg_difficulty"]
        all_reviews.extend(reviews)
        
        if i % 10 == 0:
            print(f"Progress: {i}/{min(max_professors, len(professors))} professors, {len(all_reviews)} reviews")
        time.sleep(0.3)
    
    os.makedirs("data", exist_ok=True)
    reviews_df = pd.DataFrame(all_reviews)
    reviews_df.to_csv("data/reviews.csv", index=False)
    prof_df.to_csv("data/professors.csv", index=False)
    
    print(f"\nDone! Scraped {len(all_reviews)} reviews from {len(professors)} professors")
    print("Saved to data/reviews.csv and data/professors.csv")
    return reviews_df, prof_df

if __name__ == "__main__":
    scrape_ucsd(max_professors=500, reviews_per_prof=20)