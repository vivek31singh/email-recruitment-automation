import puppeteer from 'puppeteer';

export async function crawlOcodeWebsite(url: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await page.waitForSelector('.awsm-job-container', { timeout: 30000 });

    const jobData = await page.evaluate(() => {
      const title = document.querySelector('.awsm-jobs-single-title')?.textContent?.trim() || '';
      const category =
        document
          .querySelector('.awsm-job-specification-job-category .awsm-job-specification-term')
          ?.textContent?.trim() || '';
      const type =
        document.querySelector('.awsm-job-specification-job-type .awsm-job-specification-term')?.textContent?.trim() ||
        '';
      const location =
        document
          .querySelector('.awsm-job-specification-job-location .awsm-job-specification-term')
          ?.textContent?.trim() || '';
      const salary =
        document.querySelector('.awsm-job-specification-salary .awsm-job-specification-term')?.textContent?.trim() ||
        '';

      const descriptionHTML = (document.querySelector('.awsm-job-entry-content') as HTMLElement)?.innerHTML || '';
      const descriptionText = (document.querySelector('.awsm-job-entry-content') as HTMLElement)?.innerText || '';

      return {
        title,
        category,
        type,
        location,
        salary,
        descriptionHTML,
        descriptionText,
      };
    });
    return jobData;
  } catch (error) {
    console.error('Error crawling:', error);
  } finally {
    await browser.close();
  }
}
