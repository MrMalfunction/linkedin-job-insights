// JSESSIONID cache
let jsessionid = null;

// Fetch the JSESSIONID from storage once on load
chrome.storage.sync.get("jsessionid", function (result) {
  if (result.jsessionid) {
    console.log("Retrieved JSESSIONID from storage");
    jsessionid = result.jsessionid;
  } else {
    console.log("No JSESSIONID found in storage");
  }
});

// Constants
const DEFAULT_LIMIT = 300;
const QUERY_ID = "voyagerJobsDashJobPostingDetailSections.c07b0d44515bceba51a9b73c01b0cecb";

// Cache for job details
const jobDetailsCache = {};

/**
 * Fetches the applicant count for a specific job ID
 */
async function fetchApplicantCount(jobId) {
  if (!jsessionid) {
    console.log("JSESSIONID is not available");
    return null;
  }

  const jobPostingUrn = encodeURIComponent(`urn:li:fsd_jobPosting:${jobId}`);
  const variables = `(cardSectionTypes:List(JOB_APPLICANT_INSIGHTS),jobPostingUrn:${jobPostingUrn},includeSecondaryActionsV2:true)`;
  const url = `https://www.linkedin.com/voyager/api/graphql?variables=${variables}&queryId=${QUERY_ID}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "csrf-token": jsessionid },
      credentials: "include",
    });

    const data = await response.json();
    return (
      data.data?.jobsDashJobPostingDetailSectionsByCardSectionTypes?.elements?.[0]
        ?.jobPostingDetailSection?.[0]?.jobApplicantInsightsUrn?.applicantCount || 0
    );
  } catch (error) {
    console.error("Error fetching applicant count:", error);
    return null;
  }
}

/**
 * Fetches the job details for a specific job ID
 */
async function fetchJobDetails(jobId) {
  if (!jsessionid) {
    console.log("JSESSIONID is not available");
    return null;
  }

  // First, get views and original listed date
  const detailsUrl = `https://www.linkedin.com/voyager/api/jobs/jobPostings/${jobId}`;
  try {
    const detailsResponse = await fetch(detailsUrl, {
      method: "GET",
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "accept-language": "en-US,en;q=0.9",
        "csrf-token": jsessionid,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    const detailsData = await detailsResponse.json();

    // Then, get applicant count from the separate API
    const applicantCount = await fetchApplicantCount(jobId);

    // Return combined data
    return {
      applies: applicantCount,
      views: detailsData.data?.views || 0,
      originalListedAt: detailsData.data?.originalListedAt || null,
    };
  } catch (error) {
    console.error("Error fetching job details:", error);
    return null;
  }
}

/**
 * Gets the user-configured limit from storage
 */
function getLimit() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("limit", (result) => {
      resolve(Number(result.limit) || DEFAULT_LIMIT);
    });
  });
}

/**
 * Extracts a job ID from a LinkedIn URL
 */
function extractJobIdFromUrl(url) {
  try {
    const urlObj = new URL(url);

    // First try to get it from the query parameter
    let jobId = urlObj.searchParams.get("currentJobId");

    // If not found, try to extract from the URL path
    if (!jobId) {
      const pathSegments = urlObj.pathname.split("/");
      if (pathSegments.length > 3 && pathSegments[1] === "jobs" && pathSegments[2] === "view") {
        jobId = pathSegments[3];
      }
    }

    return jobId;
  } catch (e) {
    console.error("Error extracting job ID:", e);
    return null;
  }
}

/**
 * Updates the metrics element with styling based on the job details
 */
function updateMetricsElement(element, details, limit) {
  const { applies, views, originalListedAt } = details;

  // Common styles
  const commonStyle =
    "padding: 3px 8px; border-radius: 4px; display: inline-block; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.08);";

  // Update applicant count
  const applicantElement = element.querySelector(".applicant-count");
  applicantElement.textContent = `${applies} applicants`;

  if (applies < limit) {
    // Below limit styling
    applicantElement.style.cssText = `${commonStyle} background-color: #e6f7e6; color: #006400; border: 1px solid #c3e6c3;`;
  } else {
    // Above limit styling
    applicantElement.style.cssText = `${commonStyle} background-color: #ffebeb; color: #cc0000; border: 1px solid #ffcccc;`;
  }

  // Update view count
  const viewElement = element.querySelector(".view-count");
  viewElement.textContent = `${views} views`;
  viewElement.style.cssText = `${commonStyle} background-color: #e8f0fe; color: #1a56db; border: 1px solid #b6d1fc;`;

  // Update listing date
  const dateElement = element.querySelector(".listing-date");

  if (originalListedAt) {
    const listingDate = new Date(originalListedAt);
    const now = new Date();
    const daysAgo = Math.floor((now - listingDate) / (1000 * 60 * 60 * 24));
    dateElement.textContent = `${daysAgo}d ago`;

    // Color coding based on age
    if (daysAgo <= 1) {
      dateElement.style.cssText = `${commonStyle} background-color: #e6f7e6; color: #006400; border: 1px solid #c3e6c3;`;
    } else if (daysAgo <= 7) {
      dateElement.style.cssText = `${commonStyle} background-color: #fff8e1; color: #cc0000; border: 1px solid #ffcccc;;`;
    } else {
      dateElement.style.cssText = `${commonStyle} background-color: #ffebeb; color: #cc0000; border: 1px solid #ffcccc;;`;
    }
  } else {
    dateElement.textContent = "New";
    dateElement.style.cssText = `${commonStyle} background-color: #e0f7fa; color: #006064; border: 1px solid #b2ebf2;`;
  }
}

/**
 * Creates and styles the job metrics element
 */
function createMetricsElement() {
  const element = document.createElement("div");
  element.className = "job-metrics-element";
  element.style.fontSize = "13px";
  element.style.fontWeight = "500";
  element.style.padding = "4px 0";
  element.style.display = "flex";
  element.style.gap = "8px";
  element.style.flexWrap = "wrap";
  element.style.margin = "5px 0";
  element.style.lineHeight = "1.2";
  element.innerHTML = `
    <div class="applicant-count">Fetching...</div>
    <div class="view-count">Fetching...</div>
    <div class="listing-date">Checking...</div>
  `;
  return element;
}

/**
 * Adds job metrics to job listings
 */
async function addMetricsToListings(limit) {
  const listItems = document.querySelectorAll(
    ".scaffold-layout__list li.scaffold-layout__list-item",
  );

  for (const item of listItems) {
    // Skip items that already have a metrics element
    if (item.querySelector(".job-metrics-element")) {
      continue;
    }

    const link = item.querySelector("a");
    if (!link) continue;

    const jobId = extractJobIdFromUrl(link.href);
    if (!jobId) continue;

    // Create and add the metrics element
    const metricsElement = createMetricsElement();
    item.insertAdjacentElement("afterbegin", metricsElement);

    // Check if we have cached details
    if (jobDetailsCache[jobId] !== undefined) {
      updateMetricsElement(metricsElement, jobDetailsCache[jobId], limit);
      continue;
    }

    // Fetch the job details with a small random delay to avoid rate limiting
    setTimeout(async () => {
      try {
        const details = await fetchJobDetails(jobId);
        if (details !== null) {
          jobDetailsCache[jobId] = details;
          updateMetricsElement(metricsElement, details, limit);
        } else {
          metricsElement.innerHTML = `<div>Details unavailable</div>`;
          metricsElement.style.backgroundColor = "#999";
          metricsElement.style.color = "white";
          metricsElement.style.padding = "2px 6px";
          metricsElement.style.borderRadius = "3px";
        }
      } catch (e) {
        console.error(`Error fetching details for job ${jobId}:`, e);
        metricsElement.innerHTML = `<div>Error fetching details</div>`;
        metricsElement.style.backgroundColor = "#999";
        metricsElement.style.color = "white";
        metricsElement.style.padding = "2px 6px";
        metricsElement.style.borderRadius = "3px";
      }
    }, Math.random() * 2000); // Random delay between 0-2 seconds
  }
}

/**
 * Main initialization function with retry mechanism
 */
async function init() {
  const limit = await getLimit();

  // Try to process listings immediately
  await addMetricsToListings(limit);

  // Set up observer for dynamic content changes
  const observer = new MutationObserver(() => {
    addMetricsToListings(limit);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Retry processing every 3 seconds for the first 30 seconds to catch slow-loading content
  let retries = 0;
  const retryInterval = setInterval(() => {
    addMetricsToListings(limit);
    retries++;
    if (retries >= 10) {
      clearInterval(retryInterval);
    }
  }, 3000);
}

// Listen for messages from the options page to update the limit on the fly
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateLimit") {
    getLimit().then((newLimit) => {
      // Reset all job metrics indicators
      document.querySelectorAll(".job-metrics-element").forEach((element) => {
        element.remove();
      });

      // Process the listings with the new limit
      addMetricsToListings(newLimit);
      sendResponse({ status: "limit updated", newLimit });
    });
    return true; // Indicates asynchronous response
  }
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
